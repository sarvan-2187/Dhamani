import type { ReactNode } from "react";

type Props = { title: string; children?: ReactNode; variant?: "rights" | "info" };

/** Guidance the family must read before acting. Not for errors. */
export function Notice({ title, children, variant = "rights" }: Props) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md p-4 text-ink ${variant === "info" ? "bg-surface-subtle" : "bg-brand-subtle"}`}
    >
      <p className="text-base font-semibold">{title}</p>
      {children && (
        <div className="text-sm [&_a]:font-medium [&_a]:text-brand-ink [&_a]:underline">{children}</div>
      )}
    </div>
  );
}
