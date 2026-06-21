import { describe, it, expect } from "vitest";
import { parseVenice402, buildEip3009TypedData, encodeVenicePaymentHeader, payVeniceX402 } from "../venice-x402";

// Venice's real 402 shape (captured 2026-06-13).
const body402 = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      amount: "10000000",
      payTo: "0x2670b922ef37c7df47158725c0cc407b5382293f",
      extra: { name: "USD Coin", version: "2" },
    },
    { scheme: "exact", network: "solana", asset: "EPjF…", amount: "10000000", payTo: "8qUL…" },
  ],
};

describe("parseVenice402", () => {
  it("picks the EVM (Base) requirement and ignores Solana", () => {
    const r = parseVenice402(body402)!;
    expect(r.chainId).toBe(8453);
    expect(r.network).toBe("eip155:8453");
    expect(r.amount).toBe("10000000");
    expect(r.name).toBe("USD Coin");
  });
  it("returns null when no EVM exact requirement exists", () => {
    expect(parseVenice402({ accepts: [{ scheme: "exact", network: "solana", asset: "x", amount: "1", payTo: "y" }] })).toBeNull();
  });
});

describe("buildEip3009TypedData", () => {
  it("builds a valid TransferWithAuthorization typed payload", () => {
    const req = parseVenice402(body402)!;
    const td = buildEip3009TypedData(req, "0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E", "0x" + "00".repeat(32) as `0x${string}`, 9999999999);
    expect(td.primaryType).toBe("TransferWithAuthorization");
    expect(td.domain.chainId).toBe(8453);
    expect(td.message.value).toBe(10_000_000n);
    expect(td.message.to).toBe(req.payTo);
  });
});

describe("encodeVenicePaymentHeader", () => {
  it("base64-encodes an x402 v2 exact payment", () => {
    const req = parseVenice402(body402)!;
    const h = encodeVenicePaymentHeader(req, { from: "0x1", to: req.payTo, value: req.amount }, "0xsig" as `0x${string}`);
    const decoded = JSON.parse(Buffer.from(h, "base64").toString());
    expect(decoded.x402Version).toBe(2);
    expect(decoded.scheme).toBe("exact");
    expect(decoded.payload.signature).toBe("0xsig");
  });
});

describe("payVeniceX402 (full handshake, mocked)", () => {
  it("on 402 it signs, retries with X-PAYMENT, and returns the answer", async () => {
    const calls: { hasPayment: boolean }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const hasPayment = Boolean(new Headers(init.headers).get("X-PAYMENT"));
      calls.push({ hasPayment });
      if (!hasPayment) return { status: 402, json: async () => body402 } as unknown as Response;
      return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "hi" } }] }) } as unknown as Response;
    }) as unknown as typeof fetch;

    let signedTyped: unknown = null;
    const r = await payVeniceX402({
      body: { model: "venice-uncensored", messages: [{ role: "user", content: "x" }] },
      account: "0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E",
      signTypedData: async (td) => { signedTyped = td; return "0xdeadbeef"; },
      nonce: ("0x" + "11".repeat(32)) as `0x${string}`,
      validBeforeSec: 9999999999,
      fetchImpl,
    });

    expect(calls.length).toBe(2); // first 402, then paid retry
    expect(calls[1].hasPayment).toBe(true); // retried WITH the X-PAYMENT header
    expect(signedTyped).not.toBeNull(); // EIP-3009 typed data was signed
    expect(r.paid).toBe(true);
    expect((r.data as { choices: { message: { content: string } }[] }).choices[0].message.content).toBe("hi");
  });

  it("returns early (no signing) when the first call is not 402", async () => {
    let signed = false;
    const fetchImpl = (async () => ({ status: 200, ok: true, json: async () => ({ ok: 1 }) } as unknown as Response)) as unknown as typeof fetch;
    const r = await payVeniceX402({
      body: {},
      account: "0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E",
      signTypedData: async () => { signed = true; return "0x"; },
      nonce: "0x00" as `0x${string}`,
      validBeforeSec: 1,
      fetchImpl,
    });
    expect(signed).toBe(false);
    expect(r.reason).toBe("not_402");
  });
});
