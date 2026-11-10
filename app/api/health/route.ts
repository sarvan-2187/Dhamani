import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Proves the Neon connection and reports whether PostGIS can be enabled (needed in M1).
export async function GET() {
  try {
    const [row] = await db()`
      select 1 as ok,
             exists (select 1 from pg_available_extensions where name = 'postgis') as postgis`;
    return Response.json({ db: row.ok === 1 ? "ok" : "error", postgis: row.postgis });
  } catch {
    return Response.json({ db: "error" }, { status: 503 });
  }
}
