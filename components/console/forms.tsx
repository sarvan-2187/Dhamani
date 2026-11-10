"use client";

// Console client pieces: nav, sign-in form, request actions, simulation panel, account management.
// All of them post to the server actions in app/console/actions.ts, which re-check the session.
import { useActionState, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addAccountAction,
  changeAccountAction,
  loginAction,
  referralAction,
  requestAction,
  simulationAction,
  type ActionState,
} from "@/app/console/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/Field";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Account } from "@/lib/console/accounts";
import type { RequestAction } from "@/lib/console/actions";
import { cn } from "@/lib/utils";

/** The outcome of the last action, as a sentence. Success or error is in the words, not only the colour. */
function Result({ state }: { state: ActionState }) {
  const t = useTranslations("console");
  if (!state?.key) return null;
  return (
    <p role="status" aria-live="polite" className={cn("text-sm font-medium break-words", state.ok ? "text-success" : "text-destructive")}>
      {t(state.key as never, state.values as never)}
    </p>
  );
}

export function ConsoleNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {items.map((i) => {
        const current = i.href === "/console" ? path === "/console" || path.startsWith("/console/r/") : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-12 items-center border-b-2 px-4 text-base font-medium",
              "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2",
              current ? "border-ink text-ink" : "border-transparent text-muted-foreground hover:text-ink",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LoginForm() {
  const t = useTranslations("console.login");
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-6">
      <Field label={t("email")} name="email" type="email" autoComplete="username" required />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" required />
      <Result state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}

const NEEDS_CONFIRM = new Set<RequestAction>(["cancel", "freeze"]);

/** The actions this request allows. The first one that needs no confirmation is the screen's one red button. */
export function RequestActions({ id, actions }: { id: string; actions: RequestAction[] }) {
  const t = useTranslations("console.actions");
  const [state, action, pending] = useActionState(requestAction, null);
  const [confirming, setConfirming] = useState<RequestAction | null>(null);
  const primary = actions.find((a) => !NEEDS_CONFIRM.has(a));

  if (!actions.length) return <p className="text-base text-muted-foreground">{t("none")}</p>;
  const hidden = (a: RequestAction) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={a} />
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      {confirming ? (
        <div className="flex flex-col gap-4 rounded-md bg-muted p-4">
          <p className="text-base">{t(confirming === "cancel" ? "confirmCancel" : "confirmFreeze")}</p>
          <div className="flex flex-wrap gap-2">
            <form action={action} onSubmit={() => setConfirming(null)}>
              {hidden(confirming)}
              <Button type="submit" variant="outline" disabled={pending}>
                {t("confirm")}
              </Button>
            </form>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {t("back")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) =>
            NEEDS_CONFIRM.has(a) ? (
              <Button key={a} variant="outline" onClick={() => setConfirming(a)} disabled={pending}>
                {t(a)}
              </Button>
            ) : (
              <form key={a} action={action}>
                {hidden(a)}
                <Button type="submit" variant={a === primary ? "default" : "outline"} disabled={pending}>
                  {t(a)}
                </Button>
              </form>
            ),
          )}
        </div>
      )}
      <Result state={state} />
    </div>
  );
}

/** Sends the "may we thank you publicly?" question to one referrer on WhatsApp. */
export function AskRecognition({ donorId }: { donorId: string }) {
  const t = useTranslations("console.referrals");
  const [state, action, pending] = useActionState(referralAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="donorId" value={donorId} />
      {state?.ok ? null : (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {t("ask")}
        </Button>
      )}
      <Result state={state} />
    </form>
  );
}

export function SimulationPanel() {
  const t = useTranslations("console.sim");
  const tActions = useTranslations("console.actions");
  const [seedState, seedAction, seeding] = useActionState(simulationAction, null);
  const [replyState, replyAction, replying] = useActionState(simulationAction, null);
  const [resetState, resetAction, resetting] = useActionState(simulationAction, null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("repliesTitle")}</h2>
        <p className="text-base text-muted-foreground">{t("repliesBody")}</p>
        <form action={replyAction} className="flex flex-col gap-4">
          <input type="hidden" name="op" value="replies" />
          <Field label={t("requestCode")} name="code" placeholder="DH-AB12" autoComplete="off" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("donatePct")} name="donate" type="number" min={0} max={100} defaultValue={60} required />
            <Field label={t("notNowPct")} name="notNow" type="number" min={0} max={100} defaultValue={20} required />
          </div>
          <Button type="submit" disabled={replying}>
            {t("run")}
          </Button>
          <Result state={replyState} />
        </form>
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("reseedTitle")}</h2>
        <p className="text-base text-muted-foreground">{t("reseedBody")}</p>
        <form action={seedAction}>
          <input type="hidden" name="op" value="reseed" />
          <Button type="submit" variant="outline" disabled={seeding}>
            {t("reseed")}
          </Button>
        </form>
        <Result state={seedState} />
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("resetTitle")}</h2>
        <p className="text-base text-muted-foreground">{t("resetBody")}</p>
        {confirmReset ? (
          <div className="flex flex-col gap-4 rounded-md bg-muted p-4">
            <p className="text-base">{t("confirmReset")}</p>
            <div className="flex flex-wrap gap-2">
              <form action={resetAction} onSubmit={() => setConfirmReset(false)}>
                <input type="hidden" name="op" value="reset" />
                <Button type="submit" variant="outline" disabled={resetting}>
                  {t("reset")}
                </Button>
              </form>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                {tActions("back")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setConfirmReset(true)}>
            {t("reset")}
          </Button>
        )}
        <Result state={resetState} />
      </Card>
    </div>
  );
}

export function AccountsPanel({ accounts, meId }: { accounts: Account[]; meId: string }) {
  const t = useTranslations("console");
  const [addState, addAction, adding] = useActionState(addAccountAction, null);
  const [changeState, changeAction, changing] = useActionState(changeAccountAction, null);

  const change = (a: Account, c: string, label: string) => (
    <form action={changeAction}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="email" value={a.email} />
      <input type="hidden" name="change" value={c} />
      <Button type="submit" variant="outline" size="sm" disabled={changing}>
        {label}
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <Result state={changeState} />
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {accounts.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-base font-semibold">
                  {a.name}
                  {a.id === meId && <span className="font-normal text-muted-foreground"> ({t("admin.you")})</span>}
                </span>
                <span className="text-sm break-all text-muted-foreground">{a.email}</span>
              </div>
              <span className="text-sm font-medium">
                {t(`roles.${a.role}`)} · {a.disabled ? t("admin.disabled") : t("admin.active")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {change(a, "reset_password", t("admin.resetPassword"))}
              {a.id !== meId && (
                <>
                  {a.disabled ? change(a, "enable", t("admin.enable")) : change(a, "disable", t("admin.disable"))}
                  {a.role === "coordinator"
                    ? change(a, "make_admin", t("admin.makeAdmin"))
                    : change(a, "make_coordinator", t("admin.makeCoordinator"))}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Card className="gap-4 px-6">
        <h3 className="text-h2">{t("admin.add")}</h3>
        <form action={addAction} className="flex flex-col gap-4">
          <Field label={t("admin.name")} name="name" autoComplete="off" required />
          <Field label={t("admin.email")} name="email" type="email" autoComplete="off" required />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">{t("admin.role")}</Label>
            <NativeSelect id="role" name="role" defaultValue="coordinator">
              <NativeSelectOption value="coordinator">{t("roles.coordinator")}</NativeSelectOption>
              <NativeSelectOption value="super_admin">{t("roles.super_admin")}</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={adding}>
            {t("admin.create")}
          </Button>
          <Result state={addState} />
        </form>
      </Card>
    </div>
  );
}
