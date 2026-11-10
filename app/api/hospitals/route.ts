// PRD 10.2: hospital search by name or city, or nearest to the browser's location. Data only from hospitals.csv.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 60);
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const hasPoint = p.has("lat") && p.has("lng") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (q.length < 2 && !hasPoint) return NextResponse.json({ hospitals: [] });

  const sql = db();
  const point = hasPoint ? `SRID=4326;POINT(${lng} ${lat})` : null;
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows =
    q.length >= 2
      ? await sql`
          select id, name, city, address, has_apheresis, eraktkosh_url,
                 case when ${point}::text is null then null else st_distance(geog, ${point}::geography) / 1000 end as distance_km
          from hospitals where name ilike ${like} or city ilike ${like}
          order by distance_km nulls last, name limit 20`
      : await sql`
          select id, name, city, address, has_apheresis, eraktkosh_url, st_distance(geog, ${point}::geography) / 1000 as distance_km
          from hospitals where st_dwithin(geog, ${point}::geography, 50000)
          order by distance_km limit 10`;
  return NextResponse.json({
    hospitals: rows.map((h) => ({
      id: h.id,
      name: h.name,
      city: h.city,
      address: h.address,
      hasApheresis: h.has_apheresis,
      eraktkoshUrl: h.eraktkosh_url,
      distanceKm: h.distance_km === null ? null : Math.round(Number(h.distance_km) * 10) / 10,
    })),
  });
}
