// npm run templates:md   writes TEMPLATES.md from messages/wa/*.json (tests fail if it is out of date).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderTemplatesMarkdown } from "../lib/wa/templates-md.ts";

const root = join(import.meta.dirname, "..");
const read = (lang: string) => JSON.parse(readFileSync(join(root, "messages", "wa", `${lang}.json`), "utf8"));
writeFileSync(join(root, "TEMPLATES.md"), renderTemplatesMarkdown({ en: read("en"), ta: read("ta"), te: read("te") }));
console.log("templates:md: wrote TEMPLATES.md");
