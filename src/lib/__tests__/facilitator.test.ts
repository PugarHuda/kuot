import { describe, it, expect } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { verifyPayment, networkToChainId } from "../facilitator";
import type { PaymentPayload, PaymentRequirements } from "../x402";

const ASSET = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const PAYTO = "0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E" as const;
const DM = "0x0000000000000000000000000000000000000001" as const;

const reqs: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "10000",
  resource: "/api/paper/1",
  description: "paper",
  asset: ASSET,
  payTo: PAYTO,
  extra: { method: "erc7710", delegationManager: DM },
};

const transferData = (to: `0x${string}`, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });

const payload = (over: Partial<PaymentPayload["payload"]> = {}, top: Partial<PaymentPayload> = {}): PaymentPayload => ({
  x402Version: 1,
  scheme: "exact",
  network: "base-sepolia",
  payload: {
    method: "erc7710",
    permissionContext: "0xabcd",
    delegationManager: DM,
    execution: { to: ASSET, value: "0", data: transferData(PAYTO, 10_000n) },
    ...over,
  },
  ...top,
});

describe("verifyPayment", () => {
  it("accepts a correct ERC-7710 transfer payment", () => {
    expect(verifyPayment(payload(), reqs)).toEqual({ isValid: true, payer: DM });
  });
  it("accepts an overpayment (amount > required)", () => {
    expect(verifyPayment(payload({ execution: { to: ASSET, value: "0", data: transferData(PAYTO, 20_000n) } }), reqs).isValid).toBe(true);
  });
  it("rejects a network mismatch", () => {
    expect(verifyPayment(payload({}, { network: "base" }), reqs).invalidReason).toBe("network_mismatch");
  });
  it("rejects a scheme mismatch", () => {
    expect(verifyPayment(payload({}, { scheme: "wrong" as never }), reqs).invalidReason).toBe("scheme_mismatch");
  });
  it("rejects a wrong delegation manager", () => {
    expect(verifyPayment(payload({ delegationManager: "0x0000000000000000000000000000000000000002" }), reqs).invalidReason).toBe(
      "delegation_manager_mismatch",
    );
  });
  it("rejects payment to the wrong recipient", () => {
    expect(verifyPayment(payload({ execution: { to: ASSET, value: "0", data: transferData("0x000000000000000000000000000000000000dEaD", 10_000n) } }), reqs).invalidReason).toBe(
      "wrong_recipient",
    );
  });
  it("rejects an underpayment", () => {
    expect(verifyPayment(payload({ execution: { to: ASSET, value: "0", data: transferData(PAYTO, 9_999n) } }), reqs).invalidReason).toBe(
      "insufficient_amount",
    );
  });
  it("rejects a missing permission context", () => {
    expect(verifyPayment(payload({ permissionContext: "0x" }), reqs).invalidReason).toBe("missing_permission_context");
  });
});

describe("networkToChainId", () => {
  it("maps common networks", () => {
    expect(networkToChainId("base")).toBe(8453);
    expect(networkToChainId("base-sepolia")).toBe(84532);
    expect(networkToChainId("eip155:8453")).toBe(8453);
    expect(networkToChainId("unknown")).toBeUndefined();
  });
});
