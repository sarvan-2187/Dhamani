"use client";

// PRD 10.2 request form. One column, one red button (sticky at the bottom), every field labelled.
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LocateFixed } from "lucide-react";
import { readSlip } from "@/lib/ocr";
import { PATIENT_LABEL_RE } from "@/lib/requests/patient";
import { BloodGroupPicker, type BloodGroupChoice } from "./ui/BloodGroupPicker";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Field } from "./ui/Field";
import { Label } from "./ui/label";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Notice } from "./ui/Notice";

type Hospital = { id: string; name: string; city: string; address: string; hasApheresis: boolean; eraktkoshUrl: string | null; distanceKm: number | null };
const COMPONENTS = ["whole_blood", "prbc", "platelets_rdp", "platelets_sdp", "ffp"] as const;
type Component = (typeof COMPONENTS)[number];
const MAX_SLIP_BYTES = 3 * 1024 * 1024;
const ERAKTKOSH = "https://eraktkosh.mohfw.gov.in/";

const fileInput =
  "min-h-12 w-full text-base file:mr-4 file:min-h-12 file:rounded-md file:border file:border-border-control file:bg-surface file:px-4 file:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input, `hours` from now. */
function localInput(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function RequestForm() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hospital[] | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [patient, setPatient] = useState("");
  const [group, setGroup] = useState<BloodGroupChoice | null>(null);
  const [component, setComponent] = useState<Component>("whole_blood");
  const [units, setUnits] = useState(1);
  const [neededBy, setNeededBy] = useState(() => localInput(4));
  const [critical, setCritical] = useState(false);
  const [slip, setSlip] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "posting" | "readingSlip">(null);

  useEffect(() => {
    if (hospital || query.trim().length < 2) return;
    const id = setTimeout(async () => {
      const r = await fetch(`/api/hospitals?q=${encodeURIComponent(query.trim())}`).catch(() => null);
      if (r?.ok) setResults((await r.json()).hospitals);
    }, 250);
    return () => clearTimeout(id);
  }, [query, hospital]);

  function nearMe() {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await fetch(`/api/hospitals?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`).catch(() => null);
        if (r?.ok) setResults((await r.json()).hospitals);
      },
      () => setGeoError(true),
      { timeout: 10_000 },
    );
  }

  const sdpBlocked = component === "platelets_sdp" && hospital !== null && !hospital.hasApheresis;
  const blocker = !hospital ? t("form.chooseHospitalFirst") : !group || group === "unknown" ? t("common.chooseGroupFirst") : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (blocker || sdpBlocked || !hospital || !group) return;
    const errs: Record<string, string> = {};
    if (!PATIENT_LABEL_RE.test(patient.trim())) errs.patient = t("requestForm.patientError");
    const due = new Date(neededBy);
    if (!(due.getTime() > Date.now())) errs.neededBy = t("form.neededByError");
    if (slip && slip.size > MAX_SLIP_BYTES) errs.slip = t("form.slipTooBig");
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;

    setBusy("posting");
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hospitalId: hospital.id, patientLabel: patient.trim(), group, component, units, neededBy: due.toISOString(), isCritical: critical }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 401) return router.push("/login?next=/request/new");
    if (!res?.ok) {
      setBusy(null);
      const known = { too_many_open: "form.tooManyOpen", needs_apheresis: "form.needsApheresis", needed_by_past: "form.neededByError", patient_label: "requestForm.patientError" } as const;
      return setFormError(t(known[j.error as keyof typeof known] ?? "form.generic"));
    }
    if (slip) {
      setBusy("readingSlip");
      try {
        const fd = new FormData();
        fd.append("file", slip);
        fd.append("ocrText", await readSlip(slip, locale).catch(() => ""));
        await fetch(`/api/requests/${j.slug}/slip`, { method: "POST", body: fd });
      } catch {
        // The request is posted; the slip can be added again from the request page.
      }
    }
    router.push(`/r/${j.slug}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <h1 className="text-h1">{t("form.title")}</h1>

      <Card className="px-6">
        {hospital ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">{t("form.hospital")}</p>
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-surface-subtle p-4">
              <div className="flex flex-col">
                <p className="text-base font-semibold">{hospital.name}</p>
                <p className="text-sm text-ink-muted">{hospital.address}</p>
              </div>
              <Button variant="ghost" onClick={() => { setHospital(null); setResults(null); }}>
                {t("form.change")}
              </Button>
            </div>
            <Notice variant="info" title={t("form.stockTitle")}>
              <p>
                {t("form.stockBody")}{" "}
                <a href={hospital.eraktkoshUrl ?? ERAKTKOSH} target="_blank" rel="noreferrer">
                  {t("form.stockLink")}
                </a>
              </p>
            </Notice>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field label={t("form.hospital")} hint={t("form.hospitalHint")} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            <Button variant="outline" onClick={nearMe}>
              <LocateFixed size={20} strokeWidth={1.75} aria-hidden />
              {t("form.nearMe")}
            </Button>
            {geoError && <p className="text-sm font-medium text-danger">{t("form.nearMeError")}</p>}
            {results && results.length === 0 && <p className="text-sm text-ink-muted">{t("form.noResults")}</p>}
            {results && results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setHospital(h)}
                      className="flex min-h-12 w-full flex-col items-start rounded-md border border-border-control bg-surface px-4 py-2 text-left hover:bg-surface-subtle focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                    >
                      <span className="text-base font-medium">{h.name}</span>
                      <span className="text-sm text-ink-muted">
                        {h.city}
                        {h.distanceKm !== null ? ` · ${h.distanceKm} km` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card className="px-6">
        <Field label={t("requestForm.patientLabel")} hint={t("requestForm.patientHint")} error={errors.patient} value={patient} onChange={(e) => setPatient(e.target.value)} autoComplete="off" />
        <BloodGroupPicker value={group} onChange={setGroup} />
      </Card>

      <Card className="px-6">

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="component">{t("form.componentLabel")}</Label>
          <NativeSelect id="component" value={component} onChange={(e) => setComponent(e.target.value as Component)}>
            {COMPONENTS.map((c) => (
              <NativeSelectOption key={c} value={c}>{t(`component.${c}`)}</NativeSelectOption>
            ))}
          </NativeSelect>
          {sdpBlocked && <p className="text-sm font-medium text-danger">{t("form.needsApheresis")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="units">{t("form.unitsLabel")}</Label>
          <NativeSelect id="units" value={units} onChange={(e) => setUnits(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <Field label={t("form.neededByLabel")} type="datetime-local" value={neededBy} min={localInput(0)} error={errors.neededBy} onChange={(e) => setNeededBy(e.target.value)} />

        <div className="flex min-h-12 items-start gap-3">
          <Checkbox id="critical" checked={critical} onCheckedChange={(v) => setCritical(v === true)} className="relative mt-0.5 after:absolute after:-inset-3 after:content-['']" /* 48px tap area */ />
          <Label htmlFor="critical" className="flex flex-col items-start gap-0.5">
            <span className="text-base font-medium">{t("form.critical")}</span>
            <span className="text-sm font-normal text-muted-foreground">{t("form.criticalHint")}</span>
          </Label>
        </div>
      </Card>

      <Card className="px-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slip">{t("form.slip")}</Label>
          <input id="slip" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setSlip(e.target.files?.[0] ?? null)} className={fileInput} />
          <p className="text-sm text-ink-muted">{t("form.slipHint")}</p>
          {errors.slip && <p className="text-sm font-medium text-danger">{errors.slip}</p>}
        </div>
      </Card>

      <Notice title={t("rights.title")}>
        <p>{t("rights.body")}</p>
      </Notice>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-surface-raised px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {formError && <p className="text-sm font-medium text-danger" role="alert">{formError}</p>}
        <Button type="submit" className="w-full" disabled={!!blocker || sdpBlocked || busy !== null}>
          {busy ? t(`form.${busy}`) : t("form.submit")}
        </Button>
        {blocker && <p className="text-sm text-ink-muted">{blocker}</p>}
      </div>
    </form>
  );
}
