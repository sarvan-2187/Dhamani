// Super admin (owner request 2026-11-09): manage console accounts. Passwords are generated here and shown
// once; only the scrypt hash is stored. A super admin cannot disable or demote themselves (no lockout).
// Note: `npm run db:seed` re-applies roles from SUPER_ADMIN_EMAILS for the emails it lists.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import { db } from "../db";
import { audit, type Coordinator } from "./auth";

export type Account = { id: string; email: string; name: string; role: Coordinator["role"]; disabled: boolean };

export async function listAccounts(): Promise<Account[]> {
  const rows = await db()`select id, email, name, role, disabled_at from coordinators order by created_at`;
  return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, disabled: r.disabled_at !== null }));
}

const newPassword = () => randomBytes(12).toString("base64url");

export const NewAccount = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  name: z.string().trim().min(2).max(60),
  role: z.enum(["coordinator", "super_admin"]),
});

export const ACCOUNT_CHANGES = ["disable", "enable", "reset_password", "make_admin", "make_coordinator"] as const;
export type AccountChange = (typeof ACCOUNT_CHANGES)[number];

export type AccountResult = { ok: true; password?: string } | { ok: false; error: "invalid" | "exists" | "self" | "not_found" };

export async function addAccount(admin: Coordinator, raw: unknown): Promise<AccountResult> {
  const p = NewAccount.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const password = newPassword();
  const rows = await db()`
    insert into coordinators (email, name, password_hash, role)
    values (${p.data.email}, ${p.data.name}, ${await hashPassword(password)}, ${p.data.role})
    on conflict (email) do nothing returning id`;
  if (!rows.length) return { ok: false, error: "exists" };
  await audit(admin.id, `account_added_${p.data.role}:${rows[0].id}`);
  return { ok: true, password };
}

export async function changeAccount(admin: Coordinator, id: string, change: AccountChange): Promise<AccountResult> {
  if (id === admin.id && change !== "reset_password") return { ok: false, error: "self" };
  const sql = db();
  let password: string | undefined;
  let rows: unknown[];
  switch (change) {
    case "disable":
      rows = await sql`update coordinators set disabled_at = now() where id = ${id} and disabled_at is null returning id`;
      await sql`delete from console_sessions where coordinator_id = ${id}`; // signs them out everywhere
      break;
    case "enable":
      rows = await sql`update coordinators set disabled_at = null where id = ${id} returning id`;
      break;
    case "reset_password":
      password = newPassword();
      rows = await sql`update coordinators set password_hash = ${await hashPassword(password)} where id = ${id} returning id`;
      await sql`delete from console_sessions where coordinator_id = ${id}`;
      break;
    case "make_admin":
    case "make_coordinator":
      rows = await sql`
        update coordinators set role = ${change === "make_admin" ? "super_admin" : "coordinator"} where id = ${id} returning id`;
      break;
  }
  if (!rows.length) return { ok: false, error: "not_found" };
  await audit(admin.id, `account_${change}:${id}`);
  return { ok: true, password };
}
