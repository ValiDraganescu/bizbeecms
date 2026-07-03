"use client";

import { useState } from "react";

/**
 * THE number input for the CMS admin — reuse this, never hand-roll
 * `<input type="number">` (CLAUDE.md rule, 2026-07-03).
 *
 * Controlled by a NUMBER (undefined = empty), but keeps a local string draft
 * while the user is typing so the field can be fully cleared: a bare controlled
 * input whose value falls back to a number snaps back on every keystroke, so
 * you could type "02" but never "2". The draft is dropped on blur, after which
 * the field shows the canonical value again.
 *
 * Deliberately dumb: `min`/`max` are HTML attributes only — clamping/flooring
 * stays in the caller's onValue, next to the prop it protects.
 */
export function NumberInput({
  value,
  onValue,
  min,
  max,
  step,
  placeholder,
  ariaLabel,
  className,
  id,
}: {
  value: number | undefined;
  onValue: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? value ?? ""}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = e.target.value === "" ? NaN : Number(e.target.value);
        onValue(Number.isNaN(n) ? undefined : n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
