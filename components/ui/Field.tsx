"use client";

import { useId, type ComponentProps } from "react";
import { Input } from "./input";
import { Label } from "./label";

type Props = ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
  /** Say how to fix it: "Choose a time later than now." */
  error?: string;
};

/** Label + shadcn Input + hint + error, wired for screen readers. */
export function Field({ label, hint, error, id, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
