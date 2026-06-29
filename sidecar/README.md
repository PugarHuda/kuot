# Kuot Citation-Toll — x402 sidecar

A drop-in reverse-proxy that puts an **x402 toll** in front of *any* HTTP resource
(an RSS feed, an LLM proxy, a blog, a paywalled API) and pays the cited sources —
**no fork, no upstream change.** This is Canteen's "attach a payment layer via
reverse-proxy" distribution pattern, packaged as a reusable primitive.

```
npm run toll                       # serves :8402, upstream = HN frontpage RSS
UPSTREAM_URL=https://your.api PAY_TO=0xYourArcAddr PRICE_USDC=0.002 npm run toll
```

## Flow (all real, on-chain on Arc)
1. `GET /anything` with no payment → **HTTP 402** + x402 challenge (price, `payTo`, asset = Arc USDC).
2. Caller sends a USDC transfer to `payTo` on Arc, retries with `X-PAYMENT: <txHash>`.
3. The sidecar **verifies the payment on-chain** (a confirmed USDC `Transfer` to `payTo` ≥ price —
   the same check as `src/lib/x402pay.ts`), then proxies the upstream response.
4. (Optional) With `KUOT_SETTLE_URL` + `KUOT_SETTLE_TOKEN` set, it records an on-chain attribution
   via Kuot so the upstream's authors/sources get paid.

Verified end-to-end: 402 → real toll tx on Arc → on-chain verify → 200 + upstream content +
`x-payment-response: verified`. Self-test: `node sidecar/citation-toll.mjs --selftest`.

## Env
| var | default | meaning |
|-----|---------|---------|
| `UPSTREAM_URL` | HN frontpage RSS | origin to proxy |
| `PAY_TO` | operator | Arc address that receives the toll |
| `PRICE_USDC` | `0.001` | toll per request |
| `ARC_RPC_URL` | Arc public RPC | chain to verify on |
| `KUOT_SETTLE_URL` / `KUOT_SETTLE_TOKEN` | — | optional: attribute sources after pay |
| `PORT` | `8402` | listen port |
