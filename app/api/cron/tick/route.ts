// PRD 3 / 12: called every minute by cron-job.org with "Authorization: Bearer <CRON_SECRET>".
import { cronAuthorized } from "@/lib/cron/auth";
import { tick } from "@/lib/cron/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await tick());
}

export const POST = GET;
