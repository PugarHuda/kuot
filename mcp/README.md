# Kuot MCP server

Let any MCP-capable agent (Claude Desktop, Cursor, Cline) use Kuot's research-and-pay
loop — and **pay Kuot to cite Kuot** (reverse-x402). An external agent that grounds an
answer in Kuot's work pays Kuot, which pays the original authors: the recursive citation
economy, exposed as three tools.

## Tools
| Tool | What it does |
|---|---|
| `kuot_research(query, papers?)` | Run a research query: agent pays sources via x402 on Arc, grounds an answer, splits USDC to cited authors. Returns synthesis + grounded payout plan + grounding digest. |
| `kuot_cite(queryId, paymentSignature?)` | Cite a stored Kuot synthesis (paid via Circle Gateway batched x402). Without payment → 402 challenge; pay then re-call. A fraction flows recursively to the original authors. |
| `kuot_authors(limit?)` | List authors Kuot has paid (on-chain `AuthorPaid` events on Arc) + wallets/earnings. |

## Install
```bash
cd mcp && npm install
```

## Configure (Claude Desktop / Cursor)
Add to your MCP client config (e.g. `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "kuot": {
      "command": "node",
      "args": ["ABSOLUTE/PATH/TO/kuot/mcp/server.mjs"],
      "env": { "KUOT_BASE_URL": "https://<your-kuot-deployment>" }
    }
  }
}
```
`KUOT_BASE_URL` defaults to `http://localhost:3000` (run `npm run dev` in the repo root first).

## Why it matters (traction)
Other hackathon agents in the Lepton Discord need paid services to demo their autonomous
paying agents (RFB-01). Kuot is a ready paid service: their agent calls `kuot_research` or
`kuot_cite` and **pays in testnet USDC on Arc** — real, pointable payment volume, and every
payment recurses back to real authors.
