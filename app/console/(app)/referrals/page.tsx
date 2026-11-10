import { getTranslations } from "next-intl/server";
import { AskRecognition } from "@/components/console/forms";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/Notice";
import { requireCoordinator } from "@/lib/console/auth";
import { loadReferralLeaders, type ReferralLeader } from "@/lib/console/read";

// Owner request 2026-11-10: thank the donors who bring the most donors in each city, publicly and with consent.
// Counts only referred donors with a verified donation. First name, city and counts only: no contact details.
export default async function ReferralsPage() {
  await requireCoordinator();
  const [leaders, t] = await Promise.all([loadReferralLeaders(), getTranslations("console.referrals")]);
  const byCity = new Map<string, ReferralLeader[]>();
  for (const l of leaders) byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
  const consent = (l: ReferralLeader) =>
    l.consent === true ? t("consent.yes") : l.consent === false ? t("consent.no") : l.asked ? t("consent.waiting") : t("consent.none");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-base text-muted-foreground">{t("body")}</p>
      </div>
      <Notice variant="info" title={t("rule")} />

      {leaders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-8 text-center text-base text-muted-foreground">{t("empty")}</p>
      ) : (
        [...byCity].map(([city, list]) => (
          <Card key={city} className="gap-4 px-6">
            <h2 className="text-h2">{city}</h2>
            <ol className="flex flex-col divide-y divide-border">
              {list.map((l, i) => (
                <li key={l.donorId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="w-6 text-base font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-base font-semibold">{l.firstName}</span>
                      <span className="text-sm text-muted-foreground">{t("row", { donated: l.donated, joined: l.joined })}</span>
                      <span className="text-sm font-medium">{consent(l)}</span>
                    </div>
                  </div>
                  {l.consent === null && !l.asked && <AskRecognition donorId={l.donorId} />}
                </li>
              ))}
            </ol>
          </Card>
        ))
      )}
    </section>
  );
}
