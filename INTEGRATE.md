# Add citation payments to your content — in an afternoon

If you run a publication, a feed, an archive, or any place where people's work is
read — and increasingly read by AI — this is how you let every contributor get
paid when their work is cited, without building a payments stack yourself.

You don't need to know anything about crypto. Payments settle in US-dollar
stablecoin (USDC), instantly, with no fees and no gas for your contributors.

There are three ways to plug in, from least to most work.

---

## 1. Point AI agents at your sources (zero code)

Kuot already grounds answers in real, live publisher feeds. If your content is in
an RSS/Atom feed (most CMSs, RSSHub, Substack, Ghost, WordPress, Mastodon, etc.),
an agent can cite it and a toll settles to the source.

- Run a research query that should surface your work, with real sources on:
  ```bash
  curl -s -X POST https://kuot-azure.vercel.app/api/research \
    -H 'content-type: application/json' \
    -d '{"query":"<a topic your site covers>","webSources":3}'
  ```
- The response's `works[]` includes `source:"rsshub"` items — real articles, each
  with the publisher as the payee. Self-host your own RSSHub and set
  `KUOT_RSSHUB_BASE` to route your whole catalog through it.

## 2. Let your contributors claim what they've earned (a link)

Every cited author has a share waiting, held by their identity until they claim it.
Give your contributors one link:

- **Researchers:** `https://kuot-azure.vercel.app/cited` — they enter their ORCID,
  see what they're owed, and link a wallet once. Every future citation pays them.
- **Pre-fill it** for a known contributor:
  `https://kuot-azure.vercel.app/dashboard/claim?orcid=0000-0001-2345-6789`

Unclaimed shares aren't lost — they accrue real yield (USYC) until collected, so
there's no rush and no expiry pressure on your contributors.

## 3. Sell your content to AI agents per use (the x402 toll-booth)

If you want agents to **pay to read or cite** your content, Kuot exposes a paid
HTTP endpoint (the x402 standard). An agent that wants the work pays a Gateway-
batched nanopayment on Arc; you (and your contributors) get the money.

- A buyer agent paying to cite a stored answer:
  ```bash
  DEV_PAY_TOKEN=… npm run traction -- 5
  ```
  Each iteration is a real on-chain settlement; a fraction flows back to the
  original authors. Use this as the template for your own paid endpoint.
- Other agents can discover and pay you through the MCP server (`npm run mcp`),
  tools: `kuot_research_paid`, `kuot_cite`.

---

## What your contributors see

Money. That's the whole pitch. A writer or researcher gets paid when an AI answer
relies on their work — something they're currently giving away for free. They
never install anything, never pay a fee, never touch a blockchain UI. They prove
their identity once (ORCID, or a wallet signature) and the citations pay them from
then on.

## What you (the publisher/community) get

A revenue layer over a catalog you already have, with the split written by the
attribution metadata you already keep — no reconciliation, no platform cut. Read
the [Distribution Bootstrap](https://thecanteenapp.com/analysis/2026/05/28/distribution-bootstrap-payments-founders.html)
for the broader thesis; this repo is a working implementation of the citation-toll
layer it describes.

Questions / want help wiring your community in? Open an issue on the repo.
