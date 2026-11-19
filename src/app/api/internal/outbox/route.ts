import { handleOutboxRun } from "../../../../server/http/outbox-handler.ts";
import { runProductionOutboxBatch } from "../../../../server/deps.ts";
import { loadRuntimeConfig } from "../../../../server/config/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleOutboxRun(request, {
    env: process.env,
    runBatch: () => runProductionOutboxBatch(loadRuntimeConfig(process.env)),
  });
}
