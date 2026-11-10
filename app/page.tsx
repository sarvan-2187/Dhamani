import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Building2, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// PRD 10.1 landing: Need blood (to the request form) and Become a donor (WhatsApp with JOIN ready).
// ponytail: no QR code yet; the owner has to approve the `qrcode` package first.
export default function Home() {
  const t = useTranslations("home");
  const business = (process.env.WA_BUSINESS_NUMBER ?? "").replace(/\D/g, "");
  const steps = [
    { icon: Building2, text: t("how1") },
    { icon: MessageCircle, text: t("how2") },
    { icon: Users, text: t("how3") },
  ];
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
      <section className="flex flex-col gap-6 pt-4">
        <span className="inline-flex size-14 items-center justify-center rounded-lg border border-border bg-surface-raised text-ink shadow-card">
          <LogoMark size={32} />
        </span>
        <h1 className="text-h1">{t("intro")}</h1>
        <Link href="/request/new" className={cn(buttonVariants(), "w-full")}>
          {t("needBlood")}
        </Link>
      </section>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("becomeDonor")}</h2>
        <p className="text-base text-ink-muted">{t("donorHint")}</p>
        <a href={`https://wa.me/${business}?text=JOIN`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          <MessageCircle size={20} strokeWidth={1.75} aria-hidden />
          {t("becomeDonor")}
        </a>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">{t("howTitle")}</h2>
        <ol className="flex flex-col gap-4">
          {steps.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-start gap-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-ink">
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <p className="pt-2 text-base">{text}</p>
            </li>
          ))}
        </ol>
        <p className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-4 text-sm text-ink-muted">
          <ShieldCheck size={20} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden />
          {t("howPrivacy")}
        </p>
      </section>
    </main>
  );
}
