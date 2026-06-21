import { NextResponse } from "next/server";
import { verifyRelayerWebhook, recordStatus, getStoredStatus } from "@/lib/webhook";

export const runtime = "nodejs";

/**
 * POST /api/relayer-webhook — the 1Shot relayer's destinationUrl.
 * Verifies the Ed25519 signature against the relayer JWKS, then records the
 * status so the UI can read it (webhook as source of truth, not polling).
 *
 * GET /api/relayer-webhook?taskId=0x... — read the latest verified status.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const ok = await verifyRelayerWebhook(body);
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const taskId = (body.taskId ?? body.TaskId) as string | undefined;
  if (taskId) {
    await recordStatus({
      taskId,
      status: String(body.status ?? "unknown"),
      txHash: body.txHash as string | undefined,
      at: Date.now(),
    });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  const status = await getStoredStatus(taskId);
  return NextResponse.json(status ?? { taskId, status: "pending" });
}
