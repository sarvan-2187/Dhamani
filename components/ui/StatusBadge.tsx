import { useTranslations } from "next-intl";

export type RequestStatus = "open" | "fulfilled" | "expired" | "cancelled" | "frozen" | "held";

const styles: Record<RequestStatus, string> = {
  open: "bg-brand-subtle text-brand-ink",
  fulfilled: "bg-success-subtle text-success",
  expired: "bg-surface-subtle text-ink-muted",
  // Not in DESIGN_SYSTEM 6.4; closed and neutral like expired.
  cancelled: "bg-surface-subtle text-ink-muted",
  held: "bg-warning-subtle text-warning",
  frozen: "bg-surface text-ink border border-border-control",
};

/** Always shows the word. Never a dot alone. `label` overrides the word (e.g. "Arrived" in the fulfilled style). */
export function StatusBadge({ status, label }: { status: RequestStatus; label?: string }) {
  const t = useTranslations("status");
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-3 text-sm font-semibold " +
        "before:size-2 before:shrink-0 before:rounded-full before:bg-current " +
        styles[status]
      }
    >
      {label ?? t(status)}
    </span>
  );
}
