"use client";

// PRD 8.1: show the code and a wa.me button, then poll every 2 s until WhatsApp confirms it.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "./ui/button";
import { Card } from "./ui/card";
import { Notice } from "./ui/Notice";

type State =
  | { kind: "loading" }
  | { kind: "ready"; code: string; waLink: string }
  | { kind: "expired" }
  | { kind: "error"; message: "rateLimited" | "error" };

export function LoginFlow({ next }: { next: string }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  const start = useCallback(async () => {
    setState({ kind: "loading" });
    const res = await fetch("/api/auth/login", { method: "POST" }).catch(() => null);
    if (!res || !res.ok) return setState({ kind: "error", message: res?.status === 429 ? "rateLimited" : "error" });
    const j = await res.json();
    setState({ kind: "ready", code: j.code, waLink: j.waLink });
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const id = setInterval(async () => {
      const r = await fetch("/api/auth/poll", { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      if (j?.status === "confirmed") {
        clearInterval(id);
        router.replace(next);
        router.refresh();
      } else if (j?.status === "expired") {
        clearInterval(id);
        setState({ kind: "expired" });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [state.kind, next, router]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("body")}</p>
      </div>

      <Card className="px-6">
        <ol className="flex flex-col gap-4">
          {[t("step1"), t("step2"), t("step3")].map((step, i) => (
            <li key={i} className="flex items-start gap-4">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border-control text-sm font-semibold">
                {i + 1}
              </span>
              <p className="pt-1 text-base">{step}</p>
            </li>
          ))}
        </ol>

        {state.kind === "loading" && <div className="h-40 rounded-md bg-surface-subtle" aria-hidden />}

        {state.kind === "ready" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-subtle p-4">
              <p className="text-sm font-medium text-ink-muted">{t("codeLabel")}</p>
              <p className="font-mono text-h1 break-all">{state.code}</p>
            </div>
            <a href={state.waLink} className={cn(buttonVariants(), "w-full")}>
              <MessageCircle size={20} strokeWidth={1.75} aria-hidden />
              {t("openWhatsApp")}
            </a>
            <p className="flex items-center justify-center gap-2 text-sm text-ink-muted" aria-live="polite">
              <LoaderCircle size={20} strokeWidth={1.75} className="motion-safe:animate-spin" aria-hidden />
              {t("waiting")}
            </p>
          </div>
        )}

        {state.kind === "expired" && (
          <div className="flex flex-col gap-4">
            <Notice variant="info" title={t("expired")} />
            <Button variant="outline" onClick={start}>
              {t("newCode")}
            </Button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-danger" role="alert">
              {t(state.message)}
            </p>
            <Button variant="outline" onClick={start}>
              {t("newCode")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
