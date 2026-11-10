// PRD 12: called once a day (03:00 IST) by cron-job.org with "Authorization: Bearer <CRON_SECRET>".
import { cronAuthorized } from "@/lib/cron/auth";
import { daily } from "@/lib/cron/daily";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await daily());
}

export const POST = GET;
