// npm run db:migrate          apply pending db/migrations/*.sql in name order
// npm run db:reset -- --yes   DROP the public schema, re-apply all migrations, then seed
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPool } from "./client.ts";
import { seed } from "./seed/seed.ts";

const dir = join(import.meta.dirname, "migrations");
const reset = process.argv.includes("--reset");

if (reset && !process.argv.includes("--yes")) {
  console.error("db:reset deletes every table and row. Re-run as: npm run db:reset -- --yes");
  process.exit(1);
}

const pool = createPool();
try {
  if (reset) {
    await pool.query("drop schema if exists public cascade; create schema public;");
    console.log("reset: dropped and recreated schema public");
  }

  await pool.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await pool.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("applied", file);
    } catch (e) {
      await client.query("rollback");
      throw new Error(`${file}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.log("migrations up to date");

  if (reset) await seed(pool);
} finally {
  await pool.end();
}
