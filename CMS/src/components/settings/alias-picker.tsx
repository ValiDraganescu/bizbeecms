"use client";

/**
 * Curated-alias model picker (ai-cost-quotas W2-E, Contract E).
 *
 * The platform bills for AI, so operators choose from PM-CURATED aliases — a
 * short list of named tiers ("Fast chat", "Smart chat") — not the raw thousand-
 * model OpenRouter catalog. The alias `key` is what gets stored; the underlying
 * model id stays an operator-swappable implementation detail.
 *
 * Drop-in for `ModelPicker` (same `value`/`onChange` contract) plus a `purpose`,
 * because it degrades to that picker: when the site has no curated config (fresh
 * site, PM unreachable, local dev without PM) `/api/ai-config/aliases` answers an
 * empty list and the free catalog picker renders instead, keeping a config-less
 * CMS fully usable. That fallback mirrors the server, where `effectiveModel`
 * keeps honouring a legacy raw model id when no config is available.
 *
 * `value` may be an alias key (new) or a legacy raw model id (pre-curation): a
 * legacy id that no alias maps to shows as-is, so nothing silently changes the
 * operator's stored choice until they pick a curated alias.
 */

import { useEffect, useState } from "react";
import { ModelPicker } from "@/components/chat/model-picker";
import type { AiPurpose } from "@/lib/ai-config/types";
import { matchAlias, selectValueFor, type AliasOption } from "@/lib/ai-config/alias-options";

/**
 * Load the curated aliases for a purpose. Empty on any failure — every caller
 * treats "no aliases" as "fall back to the free catalog picker".
 */
export function useCuratedAliases(purpose: AiPurpose): {
  aliases: AliasOption[];
  loading: boolean;
} {
  const [aliases, setAliases] = useState<AliasOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void fetch(`/api/ai-config/aliases?purpose=${encodeURIComponent(purpose)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (live) setAliases((j as { aliases?: AliasOption[] }).aliases ?? []);
      })
      .catch(() => {
        if (live) setAliases([]); // uncurated → the ModelPicker fallback
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [purpose]);

  return { aliases, loading };
}

export function AliasPicker({
  value,
  onChange,
  purpose,
  requireModalities,
  requireOutputModalities,
  direction = "up",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Which curated list to offer (and, on fallback, which catalog filter). */
  purpose: AiPurpose;
  /** Forwarded to the fallback `ModelPicker` only — aliases are pre-curated. */
  requireModalities?: string[];
  requireOutputModalities?: string[];
  direction?: "up" | "down";
}) {
  const { aliases, loading } = useCuratedAliases(purpose);

  // Don't flash the full catalog picker while we're still finding out whether
  // this site is curated — that would offer models the operator may not pick.
  if (loading) {
    return (
      <select
        disabled
        aria-busy="true"
        className="w-full min-w-0 rounded-md border border-border bg-surface px-2 py-1 text-foreground-muted"
      >
        <option>{value || "…"}</option>
      </select>
    );
  }

  if (aliases.length === 0) {
    return (
      <ModelPicker
        value={value}
        onChange={onChange}
        requireModalities={requireModalities}
        requireOutputModalities={requireOutputModalities}
        direction={direction}
      />
    );
  }

  // A stored value from before curation (or from a since-removed alias) is kept
  // as its own option so the select never silently re-points to another model.
  const uncurated = value !== "" && matchAlias(aliases, value) === null;

  return (
    <select
      value={selectValueFor(aliases, value)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded-md border border-border bg-surface px-2 py-1 text-foreground"
    >
      {uncurated && <option value={value}>{value}</option>}
      {aliases.map((a) => (
        <option key={a.key} value={a.key}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
