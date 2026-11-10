import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download, MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/Notice";
import { groupFromDb } from "@/lib/blood/compat";
import { DONATION_INTERVAL_DAYS } from "@/lib/blood/eligibility";
import { db } from "@/lib/db";
import { requestCode } from "@/lib/requests/slug";
import { ensureReferralCode, inviteLink, referralStats } from "@/lib/recognition/referral";
import { TIERS, tierFor, verifyMeToken } from "@/lib/recognition/rules";
import { printableName } from "@/lib/recognition/verify";

export const dynamic = "force-dynamic";
// The token is in the URL: keep the page out of search engines and out of Referer headers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// PRD 10.4: name, group, next eligible date, verified donation count, Lifegiver tier, certificate downloads.
// Visible only to the donor, through the signed 24 h link that STATUS sends (PRD 8.2).
export default async function MePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t;
  const [t, tAll, format] = await Promise.all([getTranslations("me"), getTranslations(), getFormatter()]);
  const donorId = verifyMeToken(token, new Date(), process.env.SESSION_SECRET ?? "");
  const sql = db();
  const [d] = donorId
    ? await sql`select name, certificate_name, abo, rh, is_bombay, sex, to_char(last_donated_on, 'YYYY-MM-DD') as last_donated_on
                from donors where id = ${donorId} and stopped_at is null`
    : [];

  if (!d || !token) {
    return (
      <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
        <h1 className="text-h1">{t("title")}</h1>
        <Notice variant="info" title={t("expired")} />
      </main>
    );
  }

  const certs = await sql`
    select c.id, c.verified_at, q.public_slug, h.name as hospital
    from confirmations c join requests q on q.id = c.request_id join hospitals h on h.id = q.hospital_id
    where c.donor_id = ${donorId} and c.verified_at is not null order by c.verified_at desc`;
  const [code, invited] = await Promise.all([ensureReferralCode(donorId!), referralStats(donorId!)]);
  const share = `https://wa.me/?text=${encodeURIComponent(t("inviteShare", { link: inviteLink(code) }))}`;
  const group = groupFromDb(d as never);
  const verified = certs.length;
  const tier = tierFor(verified);
  const nextTier = TIERS.find((x) => x > verified);
  const interval = DONATION_INTERVAL_DAYS[d.sex as keyof typeof DONATION_INTERVAL_DAYS];
  const nextDate = d.last_donated_on ? new Date(new Date(`${d.last_donated_on}T00:00:00+05:30`).getTime() + interval * 86_400_000) : null;
  const day = (x: Date) => format.dateTime(x, { dateStyle: "medium" });
  const canPrint = printableName({ name: d.name, certificateName: d.certificate_name }) !== null;

  const facts: [string, string][] = [
    [t("name"), d.name],
    [t("group"), group === "bombay" ? tAll("bloodGroup.bombay") : group],
    [t("next"), !nextDate || nextDate.getTime() <= Date.now() ? t("nextNow") : t("nextFrom", { date: day(nextDate) })],
    [t("verified"), String(verified)],
  ];

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("private")}</p>
      </div>

      <Card className="gap-4 px-6">
        <dl className="flex flex-col gap-4">
          {facts.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-base font-semibold break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="gap-2 px-6">
        <h2 className="text-h2">{t("badge")}</h2>
        {tier ? <p className="text-h1 text-brand-ink">{t("badgeName", { count: tier })}</p> : <p className="text-base">{t("badgeNone")}</p>}
        {tier > 0 && nextTier && <p className="text-sm text-muted-foreground">{t("badgeNext", { left: nextTier - verified, next: nextTier })}</p>}
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("inviteTitle")}</h2>
        <p className="text-base">{t("inviteBody")}</p>
        <p className="text-base font-semibold">{t("inviteStats", invited)}</p>
        <a href={share} className={buttonVariants({ variant: "outline" })}>
          <MessageCircle size={20} strokeWidth={1.75} aria-hidden />
          {t("inviteButton")}
        </a>
        <p className="text-sm text-muted-foreground">{t("inviteNote")}</p>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">{t("certificates")}</h2>
        {verified === 0 ? (
          <p className="text-base text-muted-foreground">{t("noCertificates")}</p>
        ) : !canPrint ? (
          <Notice variant="info" title={t("needsName")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {certs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
                <span className="min-w-0 text-base">
                  {t("certMeta", { code: requestCode(c.public_slug), hospital: c.hospital, date: day(new Date(c.verified_at)) })}
                </span>
                <a href={`/me/certificate/${c.id}?t=${encodeURIComponent(token)}`} className={buttonVariants({ variant: "outline" })}>
                  <Download size={20} strokeWidth={1.75} aria-hidden />
                  {t("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
