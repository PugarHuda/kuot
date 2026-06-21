/**
 * Per-agent Venice models — Kuot
 *
 * A multi-agent system should use the RIGHT model for each job, not one model for
 * everything. Venice exposes 250+ models through one API, so each specialist picks
 * a model suited to its task — fast/cheap for routing, strong for verification.
 * All defaults are confirmed available on the project key; override via env.
 *
 * Web-search calls (Synthesizer, Fact-checker) stay on venice-uncensored, which
 * reliably supports Venice's server-side web search.
 */
export const AGENT_MODELS = {
  // Each agent's model is INDEPENDENTLY configurable (multi-model ready) — set
  // VENICE_MODEL_PLANNER, _READER, _FACTCHECK, etc. to route any role to any of
  // Venice's 250+ models. The default is venice-uncensored: in the live, real-time
  // orchestration (8 chained/parallel calls) it gave the most reliable low latency;
  // some alternative models added enough latency to risk the function budget.
  refine: process.env.VENICE_MODEL_REFINE ?? "venice-uncensored",
  planner: process.env.VENICE_MODEL_PLANNER ?? "venice-uncensored",
  reader: process.env.VENICE_MODEL_READER ?? "venice-uncensored",
  synth: process.env.VENICE_MODEL_SYNTH ?? "venice-uncensored",
  factcheck: process.env.VENICE_MODEL_FACTCHECK ?? "venice-uncensored",
  summary: process.env.VENICE_MODEL_SUMMARY ?? "venice-uncensored",
} as const;

/** Short label for the UI/trace (drop any provider prefix). */
export function modelLabel(model: string): string {
  return model.split("/").pop() ?? model;
}
