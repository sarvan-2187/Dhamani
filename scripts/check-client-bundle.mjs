// Fails the build if a database URL or the server secret value reaches client JS (PRD 5: build-time check).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
if (!existsSync(root)) {
  console.error("check-client-bundle: .next/static not found, run next build first");
  process.exit(1);
}

let secret = process.env.DATABASE_URL;
if (!secret && existsSync(".env.local")) {
  secret = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
}

const leaks = [];
for (const entry of readdirSync(root, { recursive: true })) {
  const file = join(root, entry);
  if (!file.endsWith(".js")) continue;
  const text = readFileSync(file, "utf8");
  if ((secret && text.includes(secret)) || /postgres(ql)?:\/\/[^"'\s]+@/.test(text)) leaks.push(file);
}

if (leaks.length) {
  console.error("check-client-bundle: server secret found in client bundle:\n" + leaks.join("\n"));
  process.exit(1);
}
console.log("check-client-bundle: no server secrets in client JS");
