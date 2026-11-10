import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Server only. DATABASE_URL has no NEXT_PUBLIC_ prefix, so Next never inlines it into client JS;
// this guard catches an accidental import from a client component.
if (typeof window !== "undefined") {
  throw new Error("lib/db must not be imported in the browser");
}

let client: NeonQueryFunction<false, false> | undefined;

/**
 * HTTP driver: one round trip per query, right for Vercel serverless routes. Created on first use,
 * so modules that import this can load (and be unit-tested) without DATABASE_URL.
 * ponytail: no interactive transactions; use db/client.ts Pool (WebSocket) when M6 needs `for update skip locked`.
 */
export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    client = neon(url);
  }
  return client;
}
