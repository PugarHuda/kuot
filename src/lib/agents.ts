/**
 * Agent mesh — Kuot (A2A coordination)
 *
 * The user grants ONE budget to the Researcher. The Researcher then REDELEGATES
 * a narrowed slice to the Summarizer — a specialized sub-agent it subcontracts
 * summarization to. Authority only narrows: the Summarizer's budget, scope, and
 * expiry are all strictly tighter than the Researcher's. This is the
 * "Best A2A Coordination" track's redelegation, mapped to a real use case.
 */

export type AgentRole = {
  id: "user" | "researcher" | "planner" | "reader" | "factchecker" | "summarizer";
  label: string;
  blurb: string;
  /** Indent level in the delegation tree (0 = root). */
  depth: number;
  /** Fraction of the parent's budget this agent may redeem (0–1). */
  budgetFraction: number;
  /** Expiry as a fraction of the parent's remaining window (0–1). */
  expiryFraction: number;
  /** Human description of the narrowing caveats applied at this hop. */
  caveats: string[];
  /** The Venice model this agent reasons with (multi-model: right tool per job). */
  model?: string;
};

import { AGENT_MODELS } from "./agent-models";

/** The delegation chain, root → leaf. Each hop strictly narrows authority. */
export const AGENT_MESH: AgentRole[] = [
  {
    id: "user",
    label: "You",
    depth: 0,
    blurb: "Grant one periodic-USDC budget via ERC-7715. Keep custody; never sign again.",
    budgetFraction: 1,
    expiryFraction: 1,
    caveats: ["erc20-token-periodic", "token: USDC", "redeemer: Researcher"],
  },
  {
    id: "researcher",
    label: "Researcher agent",
    depth: 1,
    blurb: "Orchestrator. Searches the corpus, buys papers via x402, and redelegates to specialists.",
    budgetFraction: 1,
    expiryFraction: 1,
    caveats: ["inherits full budget", "may redelegate ≤ its authority", "Venice: crypto-rpc, search"],
    model: AGENT_MODELS.synth,
  },
  {
    id: "planner",
    label: "Planner agent",
    depth: 1,
    blurb: "Decomposes the question into focused sub-questions, one per Reader. No spend authority.",
    budgetFraction: 0,
    expiryFraction: 1,
    caveats: ["scope: decompose-only", "budget: none (reasoning)", "Venice: chat"],
    model: AGENT_MODELS.planner,
  },
  {
    id: "reader",
    label: "Reader agent",
    depth: 2,
    blurb: "One per sub-question. Answers its slice from the papers via Venice (chat + web search).",
    budgetFraction: 0.4,
    expiryFraction: 0.5,
    caveats: ["budget ≤ 40% of parent", "scope: read+answer one sub-question", "Venice: chat, web-search"],
    model: AGENT_MODELS.reader,
  },
  {
    id: "factchecker",
    label: "Fact-checker agent",
    depth: 2,
    blurb: "Independently verifies the key claims via a second Venice web search, flags weak ones.",
    budgetFraction: 0.15,
    expiryFraction: 0.35,
    caveats: ["budget ≤ 15% of parent", "scope: verify-only", "Venice: web-search"],
    model: AGENT_MODELS.factcheck,
  },
  {
    id: "summarizer",
    label: "Summarizer agent",
    depth: 2,
    blurb: "Condenses the verified findings into a TL;DR. Smallest, shortest-lived sub-budget.",
    budgetFraction: 0.05,
    expiryFraction: 0.25,
    caveats: ["budget ≤ 5% of parent", "expiry ≤ 25% of parent", "scope: summarize-only"],
    model: AGENT_MODELS.summary,
  },
];

/** Compute the concrete narrowed budget/expiry for a hop, given the root grant. */
export function narrowedFor(
  role: AgentRole,
  rootBudgetUSDC: number,
  rootExpiryUnix: number,
  nowUnix: number,
): { budgetUSDC: number; expiryUnix: number } {
  const window = Math.max(0, rootExpiryUnix - nowUnix);
  return {
    budgetUSDC: rootBudgetUSDC * role.budgetFraction,
    expiryUnix: nowUnix + window * role.expiryFraction,
  };
}
