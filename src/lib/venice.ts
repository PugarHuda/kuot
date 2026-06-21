/**
 * Venice AI client — Kuot
 *
 * Venice exposes an OpenAI-compatible API at https://api.venice.ai/api/v1.
 * We use multiple endpoints to score on the "Best use of Venice AI" track:
 *   - chat completions (synthesis) + venice_parameters.enable_web_search (cited sources)
 *   - embeddings (citation de-dup / matching)
 *   - image generation (citation receipt card)
 *   - audio/speech TTS (audio briefing)
 *
 * Venice differentiator vs OpenAI: private (zero data retention) + uncensored.
 * That lets Kuot research sensitive topics without content-policy refusals —
 * something you literally cannot build on OpenAI.
 *
 * Auth: VENICE_API_KEY (server-side only). An x402 wallet-pay path
 * (venice-x402-client, USDC on Base, no API key) is wired separately in x402.ts.
 */

const VENICE_BASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";

function apiKey(): string {
  const k = process.env.VENICE_API_KEY;
  if (!k) throw new Error("VENICE_API_KEY is not set");
  return k;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type WebSearchCitation = {
  title?: string;
  url?: string;
  date?: string;
};

export type ChatResult = {
  text: string;
  /** Citations returned when web search is enabled (venice_parameters). */
  citations: WebSearchCitation[];
  raw: unknown;
};

/**
 * Chat completion. When `webSearch` is true we pass venice_parameters so the
 * model grounds its answer in live web sources and returns citations — used
 * both for the research synthesis and to surface source URLs to attribute.
 */
export async function veniceChat(opts: {
  messages: ChatMessage[];
  model?: string;
  webSearch?: boolean;
  temperature?: number;
}): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    // venice-uncensored is Venice's own private, uncensored model — the
    // capability you can't get on OpenAI, and the core of our Venice-track story.
    model: opts.model ?? process.env.VENICE_CHAT_MODEL ?? "venice-uncensored",
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.webSearch) {
    // Venice-specific: server-side web search + inline source citations.
    body.venice_parameters = {
      enable_web_search: "on",
      enable_web_citations: true,
      include_search_results_in_stream: false,
    };
  }

  const res = await fetch(`${VENICE_BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Venice chat ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    venice_parameters?: { web_search_citations?: WebSearchCitation[] };
  };

  return {
    text: json.choices?.[0]?.message?.content ?? "",
    citations: json.venice_parameters?.web_search_citations ?? [],
    raw: json,
  };
}

/** Embeddings — used to de-dup citations and match authors to a known corpus. */
export async function veniceEmbed(input: string | string[], model?: string): Promise<number[][]> {
  const res = await fetch(`${VENICE_BASE}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({ model: model ?? process.env.VENICE_EMBED_MODEL ?? "text-embedding-bge-m3", input }),
  });
  if (!res.ok) throw new Error(`Venice embeddings ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  return (json.data ?? []).map((d) => d.embedding);
}

/** Image generation — renders the "citation receipt" card shown after a payout. */
export async function veniceImage(prompt: string, model?: string): Promise<string> {
  const res = await fetch(`${VENICE_BASE}/image/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: model ?? process.env.VENICE_IMAGE_MODEL ?? "z-image-turbo",
      prompt,
      width: 1024,
      height: 1024,
      format: "webp",
      return_binary: false,
    }),
  });
  if (!res.ok) throw new Error(`Venice image ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { images?: string[] };
  // Base64 (data URI-ready) image string.
  return json.images?.[0] ?? "";
}

/** Text-to-speech — produces the audio briefing of a completed research run. */
export async function veniceSpeech(text: string, voice?: string, model?: string): Promise<ArrayBuffer> {
  const res = await fetch(`${VENICE_BASE}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: model ?? process.env.VENICE_TTS_MODEL ?? "tts-kokoro",
      input: text,
      voice: voice ?? "af_sky",
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`Venice speech ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

export const VENICE_ENDPOINTS_USED = [
  "chat/completions (+web_search)",
  "embeddings",
  "image/generate",
  "audio/speech",
] as const;
