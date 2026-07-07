"use client";

/**
 * CMS llms.txt template settings UI (seo-robots goal — user-queued
 * editable-llms.txt track). Edits the free-text template that
 * `app/llms.txt/route.ts` renders (or falls back to auto output when blank).
 * GETs / PUTs `/api/settings/llms`.
 *
 * Layout: the template editor on the LEFT, a variables reference panel on the
 * RIGHT (per the user requirement) listing every `LLMS_TEMPLATE_VARS` entry
 * (name + one-line description + example). Clicking a variable inserts its
 * `{{slot}}` at the cursor — the exact same `{{slot}}` syntax components use.
 *
 * The PUT HARD-REJECTS unknown `{{slot}}` tokens (code `unknownSlots`), unlike
 * the robots PUT which normalizes silently — a typo'd slot would silently
 * vanish in the served file, so we surface it and name the bad token(s).
 *
 * REST-only (no server actions). Copy via next-intl (EN/FI/ET), purpose-token
 * Tailwind utilities only.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LLMS_TEMPLATE_VARS } from "@/lib/render/llms-template";

export function LlmsEditor({ initial }: { initial: string }) {
  const t = useTranslations("llms");
  const [template, setTemplate] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Insert `{{slot}}` at the cursor (or replace selection). */
  function insertVar(slot: string) {
    const snippet = `{{${slot}}}`;
    const el = textareaRef.current;
    if (!el) {
      setTemplate((v) => v + snippet);
    } else {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = template.slice(0, start) + snippet + template.slice(end);
      setTemplate(next);
      // Restore focus + caret after the inserted snippet.
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + snippet.length;
        el.setSelectionRange(caret, caret);
      });
    }
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/llms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { code?: string; slots?: string[] };
          if (j.code === "unknownSlots" && j.slots?.length) {
            msg = t("unknownSlots", { slots: j.slots.join(", ") });
          } else if (j.code) {
            msg = j.code;
          }
        } catch {
          /* non-JSON body */
        }
        setError(msg);
        return;
      }
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Editor */}
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground-muted">{t("templateLabel")}</span>
            <textarea
              ref={textareaRef}
              className="min-h-80 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
              value={template}
              onChange={(e) => {
                setSaved(false);
                setTemplate(e.target.value);
              }}
              placeholder={t("templatePlaceholder")}
              aria-label={t("templateLabel")}
              spellCheck={false}
            />
          </label>
          <p className="text-sm text-foreground-muted">{t("emptyHint")}</p>
        </div>

        {/* Variables reference panel (right) */}
        <aside className="flex flex-col gap-2">
          <h2 className="text-lg font-medium text-foreground">{t("varsTitle")}</h2>
          <p className="text-sm text-foreground-muted">{t("varsHelp")}</p>
          <ul className="flex flex-col gap-2">
            {LLMS_TEMPLATE_VARS.map((v) => (
              <li
                key={v.slot}
                className="flex flex-col gap-1 rounded-md border border-border bg-surface-raised p-3"
              >
                <button
                  type="button"
                  className="self-start rounded bg-primary-subtle px-2 py-0.5 font-mono text-xs text-foreground hover:bg-primary hover:text-primary-foreground"
                  onClick={() => insertVar(v.slot)}
                  title={t("insertVar")}
                >
                  {`{{${v.slot}}}`}
                </button>
                <span className="text-xs text-foreground-muted">
                  {t(`vars.${v.slot}`)}
                </span>
                <code className="truncate text-xs text-foreground-muted" title={v.example}>
                  {v.example.split("\n")[0]}
                </code>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-subtle px-3 py-2 text-foreground"
        >
          {t("saved")}
        </p>
      )}

      <button
        type="button"
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? t("saving") : t("save")}
      </button>
    </div>
  );
}
