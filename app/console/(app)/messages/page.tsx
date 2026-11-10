import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { requireCoordinator } from "@/lib/console/auth";
import { loadMessages } from "@/lib/console/read";

// PRD 10.5: every real and simulated message, filterable by request. Numbers show their last 4 digits only.
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireCoordinator();
  const code = ((await searchParams).code ?? "").slice(0, 12);
  const [rows, t, format] = await Promise.all([loadMessages(code), getTranslations("console.messages"), getFormatter()]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-h1">{t("title")}</h1>
      <form className="flex flex-wrap items-end gap-3" action="/console/messages">
        <div className="min-w-0 flex-1">
          <Field label={t("filter")} hint={t("filterHint")} name="code" defaultValue={code} placeholder="DH-AB12" autoComplete="off" />
        </div>
        <Button type="submit" className="mb-7">
          {t("apply")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-8 text-center text-base text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {m.direction === "in" ? t("in") : t("out")} · {m.channel === "simulated" ? t("simulated") : t("whatsapp")} ·{" "}
                  <span className="font-mono">{m.kind}</span>
                  {m.code && <span className="font-mono"> · {m.code}</span>}
                </span>
                <span className="text-muted-foreground">
                  {t("to", { last: m.to.slice(-4) })} · {format.dateTime(new Date(m.at), { dateStyle: "medium", timeStyle: "medium" })}
                </span>
              </div>
              <p className="font-mono text-xs break-all text-muted-foreground">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
