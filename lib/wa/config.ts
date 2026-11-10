// WhatsApp environment. Read lazily so tests and builds without WhatsApp settings still work.

export const MAX_ALLOWLIST = 5;

/** WA_ALLOWLIST: comma-separated E.164 digits (no +), at most 5. Fails closed: anything invalid throws. */
export function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  const items = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\+/, ""));
  for (const n of items) {
    if (!/^\d{8,15}$/.test(n)) throw new Error("WA_ALLOWLIST entries must be 8 to 15 digits");
  }
  if (items.length > MAX_ALLOWLIST) throw new Error(`WA_ALLOWLIST allows at most ${MAX_ALLOWLIST} numbers`);
  return new Set(items);
}

export function waEnv() {
  return {
    allowlist: parseAllowlist(process.env.WA_ALLOWLIST),
    simulationMode: process.env.SIMULATION_MODE === "true",
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WA_ACCESS_TOKEN ?? "",
    graphVersion: process.env.WA_GRAPH_VERSION || "v23.0", // Meta Get Started example version, checked 2026-11-09
  };
}
