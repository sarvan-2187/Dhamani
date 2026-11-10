"use server";

// Console server actions. Next.js checks the Origin header on server actions (CSRF); each action re-checks the
// session and role itself, because a server action is a public endpoint.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sessionCookieOptions } from "@/lib/auth/session";
import { addAccount, changeAccount, ACCOUNT_CHANGES } from "@/lib/console/accounts";
import { REQUEST_ACTIONS, runRequestAction } from "@/lib/console/actions";
import { CONSOLE_COOKIE, currentCoordinator, login, logout } from "@/lib/console/auth";
import { resetDemoData, reseedSyntheticDonors, simulateReplies, simulationEnabled } from "@/lib/console/simulation";
import { db } from "@/lib/db";
import { askRecognitionConsent } from "@/lib/recognition/referral";

export type ActionState = { ok?: boolean; key?: string; values?: Record<string, string | number> } | null;

async function coordinator(superAdmin = false) {
  const c = await currentCoordinator();
  if (!c) redirect("/console/login");
  if (superAdmin && c.role !== "super_admin") redirect("/console");
  return c;
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const r = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!r.ok) return { key: `login.${r.error}` };
  (await cookies()).set(CONSOLE_COOKIE, r.cookie, sessionCookieOptions(r.maxAge));
  redirect("/console");
}

export async function logoutAction() {
  await logout();
  (await cookies()).delete(CONSOLE_COOKIE);
  redirect("/console/login");
}

export async function requestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = await coordinator();
  const p = z.object({ id: z.string().uuid(), action: z.enum(REQUEST_ACTIONS) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { key: "actions.failed" };
  const ok = await runRequestAction(c.id, p.data.id, p.data.action);
  revalidatePath(`/console/r/${p.data.id}`);
  return ok ? { ok, key: "actions.done" } : { key: "actions.failed" };
}

export async function simulationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = await coordinator();
  if (!simulationEnabled()) return { key: "sim.off" };
  const op = String(form.get("op"));
  if (op === "reseed") return { ok: true, key: "sim.reseeded", values: { count: await reseedSyntheticDonors(c.id) } };
  if (op === "reset") return { ok: true, key: "sim.resetDone", values: { count: await resetDemoData(c.id) } };

  const p = z
    .object({
      code: z.string().trim().toUpperCase().regex(/^DH-[A-Z0-9]{4}$/),
      donate: z.coerce.number().int().min(0).max(100),
      notNow: z.coerce.number().int().min(0).max(100),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success || p.data.donate + p.data.notNow > 100) return { key: "sim.invalid" };
  const [r] = await db()`
    select id from requests where upper(left(public_slug, 4)) = ${p.data.code.slice(3)} order by created_at desc limit 1`;
  if (!r) return { key: "sim.notFound" };
  const res = await simulateReplies(c.id, r.id, { donatePct: p.data.donate, notNowPct: p.data.notNow });
  return { ok: true, key: "sim.ran", values: { donate: res.donate, notNow: res.not_now, silent: res.silent } };
}

export async function referralAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = await coordinator();
  const p = z.object({ donorId: z.string().uuid() }).safeParse(Object.fromEntries(form));
  const ok = p.success && (await askRecognitionConsent(c.id, p.data.donorId));
  revalidatePath("/console/referrals");
  return ok ? { ok: true, key: "referrals.asked" } : { key: "referrals.failed" };
}

export async function addAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await coordinator(true);
  const r = await addAccount(admin, Object.fromEntries(form));
  revalidatePath("/console/admin");
  return r.ok
    ? { ok: true, key: "admin.newPassword", values: { email: String(form.get("email")).trim().toLowerCase(), password: r.password! } }
    : { key: `admin.errors.${r.error}` };
}

export async function changeAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await coordinator(true);
  const p = z.object({ id: z.string().uuid(), change: z.enum(ACCOUNT_CHANGES), email: z.string() }).safeParse(Object.fromEntries(form));
  if (!p.success) return { key: "admin.errors.invalid" };
  const r = await changeAccount(admin, p.data.id, p.data.change);
  revalidatePath("/console/admin");
  if (!r.ok) return { key: `admin.errors.${r.error}` };
  return r.password
    ? { ok: true, key: "admin.newPassword", values: { email: p.data.email, password: r.password } }
    : { ok: true, key: "actions.done" };
}
