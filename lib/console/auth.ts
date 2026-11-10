// PRD 8.3: coordinator email + password (scrypt), accounts from seed or a super admin; no sign-up.
// Cookie = "<console_sessions.id>.<HMAC>", httpOnly, 12 h. The row is the truth, so disabling an account
// or signing out ends the session at once.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { sign, unsign } from "../auth/session";
import { verifyPassword } from "../auth/password";

export const CONSOLE_COOKIE = "dh_console";
const SESSION_HOURS = 12;
const MAX_FAILS = 5; // per email per 15 minutes
// Verified against when the email is unknown, so timing does not reveal which accounts exist.
const DUMMY_HASH = `scrypt$16384$8$1$${"A".repeat(22)}$${"A".repeat(86)}`;

export type Coordinator = { id: string; email: string; name: string; role: "coordinator" | "super_admin" };

export type LoginResult = { ok: true; cookie: string; maxAge: number } | { ok: false; error: "invalid" | "locked" };

export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const sql = db();
  const [{ fails }] = await sql`
    select count(*)::int as fails from audit_log
    where actor = ${email} and action = 'console_login_failed' and at > now() - interval '15 minutes'`;
  if (fails >= MAX_FAILS) return { ok: false, error: "locked" };

  const [c] = await sql`select id, password_hash from coordinators where email = ${email} and disabled_at is null`;
  const ok = await verifyPassword(password, c?.password_hash ?? DUMMY_HASH);
  if (!c || !ok) {
    await sql`insert into audit_log (actor, action) values (${email}, 'console_login_failed')`;
    return { ok: false, error: "invalid" };
  }
  const [s] = await sql`
    insert into console_sessions (coordinator_id, expires_at) values (${c.id}, now() + make_interval(hours => ${SESSION_HOURS}))
    returning id`;
  await audit(c.id, "console_login");
  return { ok: true, cookie: sign(s.id), maxAge: SESSION_HOURS * 3600 };
}

export async function currentCoordinator(): Promise<Coordinator | null> {
  const id = unsign((await cookies()).get(CONSOLE_COOKIE)?.value);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [c] = await db()`
    select c.id, c.email, c.name, c.role from console_sessions s join coordinators c on c.id = s.coordinator_id
    where s.id = ${id} and s.expires_at > now() and c.disabled_at is null`;
  return (c as Coordinator) ?? null;
}

export async function logout(): Promise<void> {
  const id = unsign((await cookies()).get(CONSOLE_COOKIE)?.value);
  if (id && /^[0-9a-f-]{36}$/.test(id)) await db()`delete from console_sessions where id = ${id}`;
}

/** For pages: the signed-in coordinator, or a redirect to the console login. */
export async function requireCoordinator(opts: { superAdmin?: boolean } = {}): Promise<Coordinator> {
  const c = await currentCoordinator();
  if (!c) redirect("/console/login");
  if (opts.superAdmin && c.role !== "super_admin") redirect("/console");
  return c;
}

export async function audit(actor: string, action: string, requestId: string | null = null) {
  await db()`insert into audit_log (actor, action, request_id) values (${actor}, ${action}, ${requestId})`;
}
