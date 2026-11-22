import { handleLeadCreate } from "../../../server/http/leads-handler.ts";
import { makeProductionStore, SYSTEM_CLOCK } from "../../../server/deps.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleLeadCreate(request, {
    clock: SYSTEM_CLOCK,
    env: process.env,
    makeStore: makeProductionStore,
  });
}
