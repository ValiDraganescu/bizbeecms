"use client";

import { useState } from "react";

/**
 * Icon-set picker (icon-sets epic). A dropdown of the curated freely-licensed
 * sets; saving PATCHes `/api/settings/icon-set`. Components resolve their
 * `{{icon "name"}}` slots against the chosen set, so switching here re-skins every
 * icon on the site (names that exist in the new set re-resolve automatically).
 *
 * ponytail: a plain <select> + Save, no live preview grid — the picker per prop
 * already previews glyphs; this only chooses the library.
 */
type Option = { id: string; label: string; license: string };

export function IconSetEditor({
  initial,
  options,
}: {
  initial: string;
  options: Option[];
}) {
  const [set, setSet] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ name: string; components: string[] }[] | null>(null);

  // Include the stored set even if it's outside the curated shortlist (a power
  // user may have set an arbitrary Iconify prefix via the API).
  const known = options.some((o) => o.id === set);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/icon-set", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { set: string };
      setSet(j.set);
      setSaved(j.set);
      // After switching, audit which referenced icons don't exist in the new set.
      const audit = (await fetch(`/api/icons/audit?set=${encodeURIComponent(j.set)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { missing?: { name: string; components: string[] }[] } | null;
      setMissing(audit?.missing ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          Icon set
        </span>
        <select
          value={set}
          onChange={(e) => {
            setSet(e.target.value);
            setSaved(null);
          }}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {!known && <option value={set}>{set} (custom)</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} — {o.license}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-success">Saved “{saved}”.</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {missing && missing.length > 0 && (
        <div className="rounded-md border border-warning bg-warning-subtle p-3 text-xs text-foreground">
          <p className="font-medium">
            {missing.length} icon{missing.length === 1 ? "" : "s"} used by your
            components don’t exist in “{saved}”. They’ll render as nothing until you
            pick replacements:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {missing.map((m) => (
              <li key={m.name}>
                <code className="font-mono">{m.name}</code>{" "}
                <span className="text-foreground-muted">
                  — in {m.components.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing && missing.length === 0 && saved && (
        <p className="text-xs text-success">
          All icons used by your components exist in “{saved}”.
        </p>
      )}

      <p className="text-xs text-foreground-muted">
        Components reference icons by name with an <code>{`{{icon "name"}}`}</code>{" "}
        slot. Changing the set re-skins every icon that exists in the new library.
        Use the AI assistant’s icon search or the icon field in a component to find
        names.
      </p>
    </div>
  );
}
