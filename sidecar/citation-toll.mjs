#!/usr/bin/env node
/**
 * Kuot Citation-Toll — a drop-in x402 sidecar.
 *
 * Put it in FRONT of any HTTP resource (an RSS feed, an LLM proxy, a blog, a
 * paywalled API). Every request is gated by HTTP 402: the caller pays a sub-cent
 * USDC toll on Arc, the sidecar verifies it ON-CHAIN, proxies the upstream
 * response, and (optionally) records an on-chain attribution via Kuot so the
 * cited sources get paid. No fork, no upstream change — Canteen's "attach a
 * payment layer via reverse-proxy" distribution pattern, as a reusable primitive.
 *
 * Same on-chain verify as src/lib/x402pay.ts#verifyPayment (a confirmed USDC
 * Transfer to payTo >= price). No header-shape stub.
 *
 * Env:
 *   UPSTREAM_URL   origin to proxy (default https://hnrss.org/frontpage)
 *   PAY_TO         Arc address that receives the toll (default = operator)
 *   PRICE_USDC     toll per request (default 0.001)
 *   ARC_RPC_URL    Arc RPC
 *   KUOT_SETTLE_URL + KUOT_SETTLE_TOKEN   (optional) record attribution after pay
 *   PORT           default 8402
 *
 * Run:  node sidecar/citation-toll.mjs
 * Test: node sidecar/citation-toll.mjs --selftest
 */
import { createServer } from "node:http";
import { createPublicClient, http as viemHttp, decodeEventLog, erc20Abi, getAddress, defineChain } from "viem";

const PORT = Number(process.env.PORT ?? 8402);
const UPSTREAM = process.env.UPSTREAM_URL ?? "https://hnrss.org/frontpage";
const PRICE_USDC6 = BigInt(Math.round(Number(process.env.PRICE_USDC ?? "0.001") * 1e6));
const USDC = getAddress(process.env.NEXT_PUBLIC_ARC_USDC ?? "0x3600000000000000000000000000000000000000");
const PAY_TO = getAddress(process.env.PAY_TO ?? "0x31481ADc889B5e00b70846F59967DAF09CBe4a3e");
const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const SETTLE_URL = process.env.KUOT_SETTLE_URL;
const SETTLE_TOKEN = process.env.KUOT_SETTLE_TOKEN;

const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain: arc, transport: viemHttp(RPC) });

/** x402 402 body: what the caller must pay to unlock this request. */
function challenge(resource) {
  return {
    x402Version: 1,
    accepts: [{
      scheme: "exact",
      network: "eip155:5042002",
      maxAmountRequired: PRICE_USDC6.toString(),
      resource,
      description: `Citation toll for ${resource} (pays the cited sources)`,
      asset: USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 120,
    }],
    error: "X-PAYMENT required: send a USDC transfer to payTo on Arc, then retry with X-PAYMENT: <txHash>",
  };
}

/** Verify on-chain that txHash is a confirmed USDC Transfer to PAY_TO >= price. */
async function verifyPayment(txHash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return false;
  try {
    const receipt = await pub.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") return false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (ev.eventName === "Transfer" && getAddress(ev.args.to) === PAY_TO && ev.args.value >= PRICE_USDC6) return true;
      } catch { /* not a Transfer */ }
    }
    return false;
  } catch { return false; }
}

/** Optional: record an on-chain attribution via Kuot so the upstream's sources get paid. */
async function attribute(resource) {
  if (!SETTLE_URL || !SETTLE_TOKEN) return null;
  try {
    const res = await fetch(SETTLE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-settle-token": SETTLE_TOKEN },
      body: JSON.stringify({ source: "citation-toll", resource }),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

const server = createServer(async (req, res) => {
  const resource = req.url ?? "/";
  const json = (code, body, extra = {}) => {
    res.writeHead(code, { "content-type": "application/json", ...extra });
    res.end(JSON.stringify(body));
  };

  const payment = req.headers["x-payment"];
  if (!payment) return json(402, challenge(resource));

  const ok = await verifyPayment(String(payment));
  if (!ok) return json(402, { ...challenge(resource), error: "payment not verified on-chain" });

  // Paid + verified → proxy the upstream and attribute the sources.
  try {
    const upstream = await fetch(UPSTREAM, { headers: { "user-agent": "kuot-citation-toll" } });
    const body = await upstream.text();
    const receipt = await attribute(resource);
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "text/plain",
      "x-payment-response": "verified",
      ...(receipt?.txHash ? { "x-attribution-tx": String(receipt.txHash) } : {}),
    });
    res.end(body);
  } catch (e) {
    json(502, { error: `upstream fetch failed: ${String(e)}` });
  }
});

// --- self-test: start, hit without payment, assert a well-formed 402 ---
if (process.argv.includes("--selftest")) {
  server.listen(0, async () => {
    const { port } = server.address();
    const r = await fetch(`http://127.0.0.1:${port}/frontpage`);
    const b = await r.json();
    const a = b.accepts?.[0];
    const pass = r.status === 402 && a?.payTo === PAY_TO && a?.maxAmountRequired === PRICE_USDC6.toString() && a?.network === "eip155:5042002";
    console.log(pass ? "✅ selftest PASS — 402 challenge well-formed" : "❌ selftest FAIL", JSON.stringify(b));
    server.close();
    process.exit(pass ? 0 : 1);
  });
} else {
  server.listen(PORT, () => {
    console.log(`Citation-Toll sidecar on :${PORT} → upstream ${UPSTREAM}`);
    console.log(`  toll ${Number(PRICE_USDC6) / 1e6} USDC → ${PAY_TO} on Arc; verified on-chain.`);
    console.log(`  curl -i localhost:${PORT}/  → 402; pay USDC, retry with  -H 'X-PAYMENT: <txHash>'`);
  });
}
