#!/usr/bin/env node
/**
 * Kuot MCP server — let any MCP-capable agent (Claude Desktop, Cursor, Cline)
 * use Kuot's research-and-pay loop, and PAY Kuot to cite Kuot (reverse-x402).
 *
 * The recursive citation economy in one tool surface: an external agent that
 * grounds an answer in Kuot's work pays Kuot, which pays the original authors.
 *
 * Config (env):
 *   KUOT_BASE_URL  — base URL of a running Kuot deployment (default http://localhost:3000)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.KUOT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function jsonFetch(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const server = new McpServer({ name: "kuot", version: "0.1.0" });

server.registerTool(
  "kuot_research",
  {
    title: "Research & pay sources",
    description:
      "Run a research query through Kuot. The agent pays for sources via x402 nanopayments on Arc, " +
      "grounds an answer, and splits USDC to the cited authors. Returns synthesis + the grounded payout plan.",
    inputSchema: {
      query: z.string().describe("the research question"),
      papers: z.number().int().min(1).max(10).optional().describe("how many papers to consult (1-10)"),
    },
  },
  async ({ query, papers }) => {
    const { status, body } = await jsonFetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, papers }),
    });
    if (status !== 200) return { isError: true, content: [{ type: "text", text: `research failed (${status}): ${JSON.stringify(body)}` }] };
    const r = body ?? {};
    const summary = {
      query: r.query,
      synthesis: r.synthesis,
      groundingDigest: r.grounding?.digest,
      groundedAuthors: (r.payouts ?? []).map((p) => ({ author: p.authorName, identity: p.identity, weightBps: p.weightBps, claimed: p.claimed })),
      x402: r.x402,
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  },
);

server.registerTool(
  "kuot_cite",
  {
    title: "Cite Kuot (reverse-x402)",
    description:
      "Fetch a stored Kuot synthesis to cite it. This is a paid resource (Circle Gateway batched x402 on Arc): " +
      "a fraction of the payment flows recursively back to the original authors. Without payment you get the 402 " +
      "challenge (price + pay-to); a GatewayClient can then pay and re-fetch.",
    inputSchema: {
      queryId: z.string().describe("the queryId of the Kuot synthesis to cite"),
      paymentSignature: z.string().optional().describe("X-PAYMENT / Payment-Signature header value, if already paid"),
    },
  },
  async ({ queryId, paymentSignature }) => {
    const headers = paymentSignature ? { "Payment-Signature": paymentSignature } : {};
    const { status, body } = await jsonFetch(`/api/summaries/${encodeURIComponent(queryId)}`, { headers });
    const label = status === 402 ? "402 Payment Required (pay then re-call with paymentSignature)" : `HTTP ${status}`;
    return { content: [{ type: "text", text: `${label}\n${JSON.stringify(body, null, 2)}` }] };
  },
);

server.registerTool(
  "kuot_authors",
  {
    title: "List paid authors",
    description: "List authors Kuot has paid (on-chain AuthorPaid events on Arc) with their wallets and earnings.",
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  },
  async ({ limit }) => {
    const { status, body } = await jsonFetch(`/api/author${limit ? `?limit=${limit}` : ""}`, {});
    if (status !== 200) return { isError: true, content: [{ type: "text", text: `authors failed (${status})` }] };
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
