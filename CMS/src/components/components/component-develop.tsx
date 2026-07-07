"use client";

/**
 * Component "Develop" workbench (admin Develop page). Two columns:
 *   left  — the Site's components, each selectable + deletable
 *   right — a live preview of the selected component, rendered in an iframe via
 *           the real renderer (`/preview/component/<name>`) so its CSS + client
 *           script stay isolated from the admin chrome.
 *
 * The preview binds each component's PLACEHOLDER data (its propsSchema `default`s,
 * authored by the AI) into the `{{slots}}`, so a component renders meaningfully on
 * its own. A component with no declared props shows a hint to add placeholder data.
 *
 * REST-only (no server actions). Copy via next-intl. Purpose Tailwind tokens only.
 *
 * ponytail: native <iframe src> + a single DELETE fetch. No preview lib, no modal
 * framework — window.confirm gates the destructive delete.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { setActiveComponentContext } from "@/lib/chat/component-context";
import { CodeEditor, type CodeLanguage } from "@/components/components/code-editor";
import { PropFields } from "@/components/components/prop-fields";
import { CollapseToggle } from "@/components/page-builder/shared";
import {
  type InspectorPreset,
  inspectorWidth,
  resolvePreset,
} from "@/lib/page-builder/inspector-width";
import { formatHtml } from "@/lib/render/parse-html";
import { bindJsonLdSlots } from "@/lib/render/jsonld-component";
import { declaredProps } from "@/lib/render/plan-tree";
import { decodeBase64Utf8 } from "@/lib/components/base64-header";
import { linkNewTabProp, parsePropsSchema } from "@/lib/pages/page-blocks";
import { applyDefaults } from "@/lib/chat/props-defaults";
import { PAGE_MUTATION_EVENT } from "@/lib/chat/page-mutation-signal";
import { capturePreviews } from "@/lib/chat/capture-preview";
import { emitChatAttachments, requestChatOpen } from "@/lib/chat/chat-attach-bus";

// localStorage keys for the Props panel width/collapse (Develop-specific).
const PROPS_PRESET_KEY = "bizbee.develop.propsWidth";
const PROPS_COLLAPSED_KEY = "bizbee.develop.propsCollapsed";

type RightView = "preview" | "code";
type CodeTab = "html" | "script" | "css";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type Draft = { html: string; script: string; css: string };
type Viewport = "desktop" | "tablet" | "mobile";

// Preview frame widths per viewport — same scales as the Page Builder.
// (mobile width comes from the chosen device below, not this map.)
const VIEWPORT_WIDTH: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

// The 10 most common mobile screen sizes (CSS px, portrait). Selecting one in
// Mobile view sizes the preview frame to that EXACT device viewport — width AND
// height — so a `min-h-screen` hero is judged against a real phone, not an
// infinitely-tall pane. Index 0 is the default.
type Device = { label: string; w: number; h: number };
const MOBILE_DEVICES: Device[] = [
  { label: "iPhone 15 / 16 (390×844)", w: 390, h: 844 },
  { label: "iPhone 15/16 Pro (393×852)", w: 393, h: 852 },
  { label: "iPhone 13/14 / mini (375×812)", w: 375, h: 812 },
  { label: "iPhone 11 / XR (414×896)", w: 414, h: 896 },
  { label: "iPhone Pro Max (393×873)", w: 393, h: 873 },
  { label: "Android flagship (412×915)", w: 412, h: 915 },
  { label: "Android mid-range (360×800)", w: 360, h: 800 },
  { label: "Android mid-range (384×832)", w: 384, h: 832 },
  { label: "Android compact (360×780)", w: 360, h: 780 },
  { label: "Compact / older (320×568)", w: 320, h: 568 },
];

const RIGHT_VIEW_KEY = "bizbee.develop.rightView";
function loadRightView(): RightView {
  try {
    return localStorage.getItem(RIGHT_VIEW_KEY) === "code" ? "code" : "preview";
  } catch {
    return "preview";
  }
}
function saveRightView(v: RightView): void {
  try {
    localStorage.setItem(RIGHT_VIEW_KEY, v);
  } catch {
    /* private mode → in-memory only */
  }
}

const CODE_TAB_LANG: Record<CodeTab, CodeLanguage> = {
  html: "html",
  script: "javascript",
  css: "css",
};

type ComponentSummary = {
  name: string;
  hasScript: boolean;
  hasCss: boolean;
  hasPreviewData: boolean;
  tags: string[];
  label?: string | null;
  kind?: string | null;
};

export function ComponentDevelop({
  initialComponents,
  initialSelected = null,
}: {
  initialComponents: ComponentSummary[];
  /** Optional deep-linked component (`?name=`), pre-validated by the page. */
  initialSelected?: string | null;
}) {
  const t = useTranslations("develop");
  // Reuse the Page Builder's inspector-width + collapse strings (same controls).
  const tPb = useTranslations("pageBuilder");
  const [components, setComponents] = useState<ComponentSummary[]>(initialComponents);
  const [selected, setSelected] = useState<string | null>(
    initialSelected ?? initialComponents[0]?.name ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bust the iframe cache on demand (after the AI iterates on a component).
  const [reloadKey, setReloadKey] = useState(0);

  // Right-pane view + which code tab is showing. View persists across reloads.
  // Start at the server default ("preview") and adopt the stored value AFTER mount
  // — reading localStorage during render would mismatch SSR and break hydration.
  const [view, setView] = useState<RightView>("preview");
  useEffect(() => setView(loadRightView()), []);
  const [codeTab, setCodeTab] = useState<CodeTab>("html");
  // Preview viewport (desktop/tablet/mobile), mirrors the Page Builder.
  const [viewport, setViewport] = useState<Viewport>("desktop");
  // Which mobile device size the frame mimics (index into MOBILE_DEVICES).
  const [deviceIdx, setDeviceIdx] = useState(0);
  const device = MOBILE_DEVICES[deviceIdx];
  // "Send preview to AI": capturing the 3 viewport screenshots → chat composer.
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // The editor drafts for the selected component (seeded from the fetched artifact;
  // edited locally; autosaved). null = not loaded yet for the current selection.
  const [draft, setDraft] = useState<Draft | null>(null);
  // The loaded component's KIND ('html' default | 'jsonld'), read from the
  // X-Component-Kind response header on the GET. Drives the JSON-LD workbench:
  // a jsonld component edits a JSON template (not html/script/css) and previews
  // the emitted structured data instead of rendering visible HTML.
  const [kind, setKind] = useState<"html" | "jsonld">("html");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // COMPONENT DRAFT/PUBLISH: editing writes an unpublished draft (live pages keep
  // rendering the published artifact). `hasDraft` drives the publish bar; `usage`
  // is the live-page blast radius shown before publishing; `publishBusy` guards
  // the publish/discard buttons.
  const [hasDraft, setHasDraft] = useState(false);
  const [usage, setUsage] = useState<Array<{ slug: string; direct: boolean }>>([]);
  const [publishBusy, setPublishBusy] = useState(false);
  // The selected component's declared props + the edited PLACEHOLDER values (its
  // propsSchema `default`s). Null = not loaded / no declared props.
  const [propsSchemaStr, setPropsSchemaStr] = useState<string | null>(null);
  const [propValues, setPropValues] = useState<Record<string, unknown>>({});
  const [propsDirty, setPropsDirty] = useState(false);

  // Props panel sizing — same presets + collapse as the Page Builder inspector.
  // Persisted under Develop-specific keys so it's independent of the builder's.
  const [propsPreset, setPropsPreset] = useState<InspectorPreset>("default");
  const [propsCollapsed, setPropsCollapsed] = useState(false);
  const [layoutW, setLayoutW] = useState(0);
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      setPropsPreset(resolvePreset(localStorage.getItem(PROPS_PRESET_KEY)));
      setPropsCollapsed(localStorage.getItem(PROPS_COLLAPSED_KEY) === "1");
    } catch {
      /* no storage — defaults */
    }
  }, []);
  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setLayoutW(entry.contentRect.width));
    ro.observe(el);
    setLayoutW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  function pickPropsPreset(p: InspectorPreset) {
    setPropsPreset(p);
    try {
      localStorage.setItem(PROPS_PRESET_KEY, p);
    } catch {
      /* no storage */
    }
  }
  function togglePropsCollapsed() {
    setPropsCollapsed((c) => {
      try {
        localStorage.setItem(PROPS_COLLAPSED_KEY, !c ? "1" : "0");
      } catch {
        /* no storage */
      }
      return !c;
    });
  }

  const current = components.find((c) => c.name === selected) ?? null;
  const propFields = parsePropsSchema(propsSchemaStr);
  const isJsonLd = kind === "jsonld";
  // For a jsonld component, the "preview" is the emitted structured data (the
  // iframe would be blank — it renders a hidden <script>). Build it from the
  // draft template + placeholder props so edits reflect live.
  const jsonLdPreview =
    isJsonLd && draft ? previewJsonLd(draft.html, propsSchemaStr, propValues) : null;

  // Publish the selected component's FULL artifact as inline chat context so the
  // assistant's next message knows which component is open AND has its whole code
  // (mirrors the Page Builder's setActivePageContext). GET ?name= returns the
  // portable bundle ({ component: {name, tree, script, css, propsSchema} }).
  // `reloadKey` is a dep so re-publishing picks up the AI's own edits after Reload.
  useEffect(() => {
    if (!selected) {
      setActiveComponentContext(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // draft=1 → edit the pending draft (saves write the draft; reseeding
        // from live after each autosave would clobber unpublished edits).
        const res = await fetch(`/api/components?name=${encodeURIComponent(selected)}&draft=1`);
        if (!res.ok) return;
        // Kind rides out-of-band in a header (it's UI-only, kept out of the
        // portable bundle). `?draft=1` returns the DRAFT kind, matching the draft
        // artifact the editor loads below.
        const loadedKind = res.headers.get("X-Component-Kind") === "jsonld" ? "jsonld" : "html";
        // For a jsonld component the RAW JSON-LD template rides in a base64 header
        // (the bundle's `tree` is a parseHtml-mangled version, useless to edit).
        const jsonTemplate =
          loadedKind === "jsonld"
            ? decodeBase64Utf8(res.headers.get("X-Component-Json-Template"))
            : null;
        const bundle = (await res.json()) as {
          component?: {
            name: string;
            tree: unknown;
            script: string;
            css: string;
            propsSchema: string | null;
          };
        };
        if (!cancelled && bundle.component) {
          setActiveComponentContext(bundle.component);
          // Seed the editor drafts from the same fetch. The bundle carries the
          // parsed tree; pretty-print it to Handlebars-HTML for the editor.
          const c = bundle.component;
          setKind(loadedKind);
          setDraft({
            // jsonld: the editor edits the raw JSON-LD template (from the header),
            // not the mangled tree; script/css are unused for a jsonld component.
            html:
              loadedKind === "jsonld"
                ? (jsonTemplate ?? "")
                : typeof c.tree === "string"
                  ? c.tree
                  : formatHtml(c.tree as Parameters<typeof formatHtml>[0]),
            script: c.script ?? "",
            css: c.css ?? "",
          });
          setSaveState("idle");
          setSaveError(null);
          // Seed the props sidebar: its declared props + each one's current
          // `default` as the editable placeholder value.
          setPropsSchemaStr(c.propsSchema ?? null);
          const fields = parsePropsSchema(c.propsSchema ?? null);
          const vals: Record<string, unknown> = {};
          for (const f of fields) {
            vals[f.name] = f.defaultValue ?? f.default;
            // Link props: seed the companion "open in new tab" flag the toggle edits.
            if (f.newTab) vals[linkNewTabProp(f.name)] = true;
          }
          setPropValues(vals);
          setPropsDirty(false);
          // Load this component's draft state + live-page blast radius.
          void loadUsage(selected);
        }
      } catch {
        /* network hiccup → leave prior context; not worth surfacing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, reloadKey]);

  // Debounced autosave: ~800ms after the last edit, PUT the draft. The route
  // re-validates (malformed markup / disallowed class / unplannable tree → 400
  // shown inline). Pattern mirrors the Page Builder's setTimeout-in-useEffect autosave.
  useEffect(() => {
    if (!selected || !draft || saveState !== "dirty") return;
    const tid = setTimeout(() => void saveDraft(selected, draft), 800);
    return () => clearTimeout(tid);
    // saveDraft is stable enough for this debounce; deps are the trigger inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saveState, selected]);

  async function saveDraft(name: string, d: Draft) {
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/components/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Always send the loaded/selected `kind` — the editor is authoritative
        // (it read the kind on load). For jsonld, `html` carries the JSON-LD
        // template and the write path routes it to jsonTemplate. Sending it on
        // every save also lets the kind toggle persist an html⇄jsonld switch.
        body: JSON.stringify({ html: d.html, script: d.script, css: d.css, kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; errors?: string[] }
          | null;
        setSaveState("error");
        setSaveError(body?.errors?.join("; ") || body?.error || `HTTP ${res.status}`);
        return;
      }
      setSaveState("saved");
      // A successful save created/updated the unpublished DRAFT — surface the
      // publish bar and (re)load the live-page blast radius.
      setHasDraft(true);
      void loadUsage(name);
      // Refresh the preview iframe (and re-publish chat context) with the saved code.
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveState("error");
      setSaveError((err as Error).message);
    }
  }

  /** Load the draft state + live pages that reference `name` (blast radius). */
  async function loadUsage(name: string) {
    try {
      const res = await fetch(`/api/components/${encodeURIComponent(name)}/usage`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        usage?: Array<{ slug: string; direct: boolean }>;
        hasDraft?: boolean;
      };
      setUsage(body.usage ?? []);
      setHasDraft(body.hasDraft ?? false);
    } catch {
      /* non-fatal — the publish bar just omits the usage line */
    }
  }

  /** Publish or discard the selected component's pending draft. */
  async function publishOrDiscard(name: string, action: "publish" | "discard") {
    setPublishBusy(true);
    try {
      const res = await fetch(`/api/components/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setSaveError(body?.error || `HTTP ${res.status}`);
        return;
      }
      // Draft consumed either way — clear the bar and refresh the preview.
      setHasDraft(false);
      setUsage([]);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setPublishBusy(false);
    }
  }

  // Edit one field of the draft and mark it dirty (triggers the debounce above).
  function editField(field: CodeTab, next: string) {
    setDraft((d) => (d ? { ...d, [field]: next } : d));
    setSaveState("dirty");
  }

  // Switch the selected component's kind (HTML ⇄ JSON-LD). Marks the draft dirty
  // so the next autosave PUT persists the new kind (staged as a draft_kind until
  // published). The editor content stays as-is: switching to JSON-LD, the current
  // html becomes the template draft (usually not valid JSON yet — the preview says
  // so until the operator writes a schema.org template), which is the intended
  // author flow. No-op when already that kind.
  function switchKind(next: "html" | "jsonld") {
    if (next === kind) return;
    setKind(next);
    setSaveState("dirty");
  }

  // Edit one prop's placeholder value → mark the props sidebar dirty.
  function editProp(name: string, value: unknown) {
    setPropValues((v) => ({ ...v, [name]: value }));
    setPropsDirty(true);
  }

  // Debounced persist of edited placeholder defaults: rewrite the propsSchema's
  // `default`s and PUT the full artifact (html/script/css unchanged) so the gate
  // re-validates, then reload the preview to show the new defaults bound in.
  useEffect(() => {
    if (!selected || !draft || !propsDirty) return;
    const tid = setTimeout(() => {
      const nextSchema = applyDefaults(propsSchemaStr, propValues);
      void (async () => {
        setSaveState("saving");
        setSaveError(null);
        try {
          const res = await fetch(`/api/components/${encodeURIComponent(selected)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              html: draft.html,
              script: draft.script,
              css: draft.css,
              propsSchema: nextSchema,
              kind,
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as
              | { error?: string; errors?: string[] }
              | null;
            setSaveState("error");
            setSaveError(body?.errors?.join("; ") || body?.error || `HTTP ${res.status}`);
            return;
          }
          setPropsSchemaStr(nextSchema);
          setPropsDirty(false);
          setSaveState("saved");
          setReloadKey((k) => k + 1);
        } catch (err) {
          setSaveState("error");
          setSaveError((err as Error).message);
        }
      })();
    }, 800);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propValues, propsDirty, selected]);

  // Clear the context when leaving the workbench so a stale component doesn't
  // ride along into chats on other admin pages.
  useEffect(() => () => setActiveComponentContext(null), []);

  // When the AI assistant creates/edits a component (it writes the SAME store this
  // workbench reads), refresh so the list shows new components and the preview
  // isn't stale — mirrors the Page Builder's mutation listener. Always refetch the
  // list + bust the preview iframe; reload the selected draft too UNLESS the
  // operator has unsaved edits (don't clobber in-progress manual work).
  useEffect(() => {
    function onMutated() {
      void refresh(); // always: new components must appear in the list
      // Bumping reloadKey re-seeds the draft from the store (seed effect dep), so
      // skip it while the operator has unsaved edits — don't clobber their work.
      if (saveState !== "dirty" && !propsDirty) setReloadKey((k) => k + 1);
    }
    window.addEventListener(PAGE_MUTATION_EVENT, onMutated);
    return () => window.removeEventListener(PAGE_MUTATION_EVENT, onMutated);
    // refresh is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, propsDirty]);

  async function refresh() {
    const res = await fetch("/api/components");
    if (res.ok) setComponents((await res.json()) as ComponentSummary[]);
  }

  async function remove(name: string) {
    if (!window.confirm(t("confirmDelete", { name }))) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/components?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setComponents((cs) => cs.filter((c) => c.name !== name));
      if (selected === name) setSelected(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Capture the selected component at desktop/tablet/mobile and hand the PNGs to
  // the chat composer so the AI (a vision model) can see how it looks at each
  // size and iterate. Fully client-side (offscreen iframes + modern-screenshot).
  async function sendPreviewToAI() {
    if (!current || capturing) return;
    setCaptureError(null);
    setCapturing(true);
    try {
      const { captures, errors } = await capturePreviews(current.name);
      if (captures.length === 0) {
        setCaptureError(errors[0] ?? t("capture.failed"));
        return;
      }
      // Open the widget FIRST so its composer mounts and subscribes; the bus
      // buffers the batch and replays it to the fresh subscriber either way.
      requestChatOpen();
      emitChatAttachments({
        images: captures.map((c) => ({ dataUrl: c.dataUrl, name: c.name, mime: "image/png" })),
        caption: t("capture.caption", { name: current.name }),
      });
    } catch (err) {
      setCaptureError((err as Error).message);
    } finally {
      setCapturing(false);
    }
  }

  const showProps = !!current && propFields.length > 0;

  // The Props track width: collapsed → a thin re-expand strip; else the chosen
  // preset resolved against the measured layout width (clamped, like the builder).
  // The width rides on a CSS var (--props-w) so the STATIC Tailwind class below
  // compiles; a runtime-interpolated arbitrary class would never be generated.
  const propsTrack = propsCollapsed
    ? "2.25rem"
    : `${inspectorWidth(propsPreset, layoutW)}px`;
  const gridCols = showProps
    ? "lg:grid-cols-[18rem_1fr_var(--props-w)]"
    : "lg:grid-cols-[20rem_1fr]";

  return (
    <div
      ref={layoutRef}
      style={{ ["--props-w" as string]: propsTrack }}
      className={"grid min-h-0 flex-1 grid-cols-1 gap-6 " + gridCols}
    >
      {/* Left: component list */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t("listTitle")}</h2>
          <button
            type="button"
            className="text-sm text-foreground-muted hover:text-foreground disabled:opacity-40"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t("refresh")}
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {components.length === 0 ? (
          <p className="text-foreground-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 overflow-y-auto">
            {components.map((c) => {
              const active = c.name === selected;
              return (
                <li key={c.name}>
                  <div
                    className={
                      "flex items-center gap-2 rounded-md border px-3 py-2 transition-colors " +
                      (active
                        ? "border-primary bg-primary-subtle"
                        : "border-border bg-surface-raised hover:bg-surface-muted")
                    }
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                      onClick={() => setSelected(c.name)}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={
                            "truncate " +
                            (c.label ? "font-medium " : "font-mono ") +
                            (active ? "text-primary" : "text-foreground")
                          }
                        >
                          {c.label || c.name}
                        </span>
                        {c.kind === "jsonld" && (
                          <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                            {t("jsonld.badge")}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-foreground-muted">
                        {[
                          c.hasScript ? t("flagScript") : null,
                          c.hasCss ? t("flagCss") : null,
                          c.hasPreviewData ? null : t("flagNoData"),
                        ]
                          .filter(Boolean)
                          .join(" · ") || t("flagStatic")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:border-danger hover:text-danger disabled:opacity-40"
                      disabled={busy}
                      aria-label={t("deleteFor", { name: c.name })}
                      onClick={() => void remove(c.name)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Right: preview / code */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {current ? t("previewTitle", { name: current.name }) : t("previewNone")}
          </h2>
          <div className="flex items-center gap-2">
            {/* Viewport selector — desktop/tablet/mobile preview widths, mirrors
                the Page Builder. Only meaningful in Preview; hidden in Code view.
                Also hidden for jsonld (no visual layout to size). */}
            {current && view === "preview" && !isJsonLd && (
              <div className="flex overflow-hidden rounded-md border border-border">
                {(["desktop", "tablet", "mobile"] as Viewport[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViewport(v)}
                    aria-pressed={viewport === v}
                    title={t(`viewport.${v}`)}
                    className={
                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors " +
                      (viewport === v
                        ? "bg-surface font-medium text-foreground"
                        : "bg-surface-muted text-foreground-muted hover:text-foreground")
                    }
                  >
                    <ViewportIcon kind={v} />
                    <span className="hidden lg:inline">{t(`viewport.${v}`)}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Device-size picker — only in Mobile view. Sizes the frame to a
                real phone viewport (width AND height) so a tall hero is judged
                against an actual screen, not an unbounded pane. */}
            {current && view === "preview" && !isJsonLd && viewport === "mobile" && (
              <select
                value={deviceIdx}
                onChange={(e) => setDeviceIdx(Number(e.target.value))}
                title={t("viewport.deviceLabel")}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
              >
                {MOBILE_DEVICES.map((d, i) => (
                  <option key={d.label} value={i}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            {/* Send the rendered component at all 3 sizes to the AI (vision) so it
                can nail the look across screen sizes. Preview view only; a jsonld
                component has no visual to screenshot. */}
            {current && view === "preview" && !isJsonLd && (
              <button
                type="button"
                onClick={() => void sendPreviewToAI()}
                disabled={capturing}
                title={t("capture.send")}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <span className="hidden lg:inline">
                  {capturing ? t("capture.capturing") : t("capture.send")}
                </span>
              </button>
            )}
            {/* Reload sits BEFORE the toggle and always occupies its slot — only
                meaningful in Preview (busts the iframe), so it's hidden (not
                removed) in Code view to avoid shifting the toggle. */}
            {current && (
              <button
                type="button"
                className={
                  "text-sm text-foreground-muted hover:text-foreground" +
                  (view === "preview" ? "" : " invisible")
                }
                aria-hidden={view !== "preview"}
                tabIndex={view === "preview" ? 0 : -1}
                onClick={() => setReloadKey((k) => k + 1)}
              >
                {t("reload")}
              </button>
            )}
            {/* Kind toggle — HTML (visible component) vs JSON-LD (invisible
                structured-data component). Switching stages a draft kind change,
                published with the next Publish. */}
            {current && draft && (
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                {(["html", "jsonld"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => switchKind(k)}
                    aria-pressed={kind === k}
                    title={k === "jsonld" ? t("jsonld.template") : t("codeTab.html")}
                    className={
                      "rounded px-3 py-1 text-sm transition-colors " +
                      (kind === k
                        ? "bg-surface-muted font-medium text-foreground"
                        : "text-foreground-muted hover:text-foreground")
                    }
                  >
                    {k === "jsonld" ? t("jsonld.badge") : t("codeTab.html")}
                  </button>
                ))}
              </div>
            )}
            {/* Preview / Code toggle — mirrors the Page Builder's center tabs. */}
            {current && (
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                {(["preview", "code"] as RightView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setView(v);
                      saveRightView(v);
                    }}
                    aria-pressed={view === v}
                    className={
                      "rounded px-3 py-1 text-sm transition-colors " +
                      (view === v
                        ? "bg-surface-muted font-medium text-foreground"
                        : "text-foreground-muted hover:text-foreground")
                    }
                  >
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {captureError && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {captureError}
          </p>
        )}

        {current && view === "preview" && !isJsonLd && !current.hasPreviewData && (
          <p
            role="status"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground-muted"
          >
            {t("noPlaceholderData")}
          </p>
        )}

        {/* Code view: sub-tabs (html / script / css) + save status. */}
        {current && view === "code" && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {isJsonLd ? (
                // A jsonld component has ONE editable surface: its JSON-LD template
                // (the html/script/css split is meaningless — it emits no markup/JS).
                <span className="rounded-md bg-surface-muted px-3 py-1 text-sm font-medium text-foreground">
                  {t("jsonld.template")}
                </span>
              ) : (
                (["html", "script", "css"] as CodeTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCodeTab(tab)}
                    aria-pressed={codeTab === tab}
                    className={
                      "rounded-md px-3 py-1 text-sm transition-colors " +
                      (codeTab === tab
                        ? "bg-surface-muted font-medium text-foreground"
                        : "text-foreground-muted hover:text-foreground")
                    }
                  >
                    {t(`codeTab.${tab}`)}
                  </button>
                ))
              )}
            </div>
            <span
              className={
                "text-xs " +
                (saveState === "error" ? "text-danger" : "text-foreground-muted")
              }
            >
              {saveState === "saving"
                ? t("save.saving")
                : saveState === "saved"
                  ? t("save.saved")
                  : saveState === "dirty"
                    ? t("save.unsaved")
                    : saveState === "error"
                      ? t("save.failed")
                      : ""}
            </span>
          </div>
        )}
        {/* Publish bar: appears when the selected component has an unpublished
            draft. Names the live-page blast radius so publishing is informed. */}
        {current && hasDraft && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning bg-warning-subtle px-3 py-2">
            <div className="min-w-0 text-xs text-foreground">
              <span className="font-medium">{t("draft.pending")}</span>{" "}
              <span className="text-foreground-muted">
                {usage.length === 0
                  ? t("draft.usageNone")
                  : t("draft.usageCount", {
                      count: usage.length,
                      pages: usage.map((u) => u.slug).join(", "),
                    })}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={publishBusy}
                onClick={() => selected && void publishOrDiscard(selected, "discard")}
                className="rounded-md border border-border px-3 py-1 text-sm text-foreground-muted hover:text-foreground disabled:opacity-50"
              >
                {t("draft.discard")}
              </button>
              <button
                type="button"
                disabled={publishBusy}
                onClick={() => selected && void publishOrDiscard(selected, "publish")}
                className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {t("draft.publish")}
              </button>
            </div>
          </div>
        )}
        {current && view === "code" && saveState === "error" && saveError && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-xs text-danger"
          >
            {saveError}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-surface">
          {!current ? (
            <div className="flex h-full min-h-[60vh] items-center justify-center text-foreground-muted">
              {t("selectPrompt")}
            </div>
          ) : view === "preview" && isJsonLd ? (
            // JSON-LD preview: the iframe would be blank (a jsonld component
            // renders a HIDDEN <script>), so show the EMITTED structured data
            // instead, with a Google Rich Results deep-link to validate it.
            <div className="flex h-full min-h-[60vh] flex-col gap-3 overflow-auto bg-surface-muted p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("jsonld.previewTitle")}
                  </h3>
                  <p className="text-xs text-foreground-muted">{t("jsonld.previewHint")}</p>
                </div>
                <a
                  href="https://search.google.com/test/rich-results"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground-muted hover:text-foreground"
                >
                  {t("jsonld.richResults")}
                </a>
              </div>
              {jsonLdPreview ? (
                <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-surface p-3 text-xs text-foreground">
                  <code>{jsonLdPreview}</code>
                </pre>
              ) : (
                <p
                  role="status"
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground-muted"
                >
                  {(draft?.html ?? "").trim() === "" ? t("jsonld.empty") : t("jsonld.invalid")}
                </p>
              )}
            </div>
          ) : view === "preview" ? (
            // Centered, width-constrained frame so tablet/mobile widths show the
            // component's responsive layout (desktop = full width).
            <div
              className={
                "flex h-full min-h-[60vh] justify-center overflow-auto bg-surface-muted p-4 " +
                (viewport === "mobile" ? "items-start" : "")
              }
            >
              <div
                className="overflow-hidden rounded-md border border-border bg-white shadow-sm"
                style={
                  viewport === "mobile"
                    ? // Fixed device viewport: exact px width × height; content
                      // scrolls inside, so a tall hero is bounded to the phone.
                      { width: `${device.w}px`, height: `${device.h}px`, maxWidth: "100%", flex: "none" }
                    : { width: VIEWPORT_WIDTH[viewport], maxWidth: "100%", height: "100%" }
                }
              >
                <iframe
                  key={`${current.name}-${reloadKey}-${viewport}-${viewport === "mobile" ? deviceIdx : ""}`}
                  title={t("previewTitle", { name: current.name })}
                  className="h-full w-full border-0 bg-white"
                  src={`/preview/component/${encodeURIComponent(current.name)}`}
                />
              </div>
            </div>
          ) : draft ? (
            <div className="h-full min-h-[60vh]">
              {isJsonLd ? (
                // Edit the JSON-LD template (stored in the `html` field for a
                // jsonld component). No script/css panes — it emits neither.
                <CodeEditor
                  key={`${current.name}-jsonld`}
                  value={draft.html}
                  language="json"
                  onChange={(next) => editField("html", next)}
                />
              ) : (
                <CodeEditor
                  key={`${current.name}-${codeTab}`}
                  value={draft[codeTab]}
                  language={CODE_TAB_LANG[codeTab]}
                  onChange={(next) => editField(codeTab, next)}
                />
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[60vh] items-center justify-center text-foreground-muted">
              {t("save.loading")}
            </div>
          )}
        </div>
      </section>

      {/* Right sidebar: edit the component's PLACEHOLDER prop values (its
          propsSchema defaults). Only shown when the component declares props. */}
      {showProps && propsCollapsed && (
        <aside className="hidden min-h-0 shrink-0 flex-col items-center rounded-md border border-border bg-surface-raised py-2 lg:flex">
          <CollapseToggle
            side="right"
            collapsed
            onClick={togglePropsCollapsed}
            label={tPb("panel.expandRight")}
          />
        </aside>
      )}
      {showProps && !propsCollapsed && (
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{t("propsTitle")}</h2>
            <span
              className={
                "text-xs " +
                (saveState === "error" ? "text-danger" : "text-foreground-muted")
              }
            >
              {propsDirty || saveState === "saving"
                ? t("save.saving")
                : saveState === "saved"
                  ? t("save.saved")
                  : ""}
            </span>
            {/* Width presets + collapse — mirrors the Page Builder inspector. */}
            <div className="ml-auto hidden items-center gap-1 lg:flex">
              <div
                className="flex rounded-md border border-border"
                role="group"
                aria-label={tPb("inspectorWidth.label")}
              >
                {(["default", "quarter", "half"] as InspectorPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => pickPropsPreset(p)}
                    aria-pressed={propsPreset === p}
                    title={tPb(`inspectorWidth.${p}`)}
                    className={`px-2 py-0.5 text-[11px] first:rounded-l-md last:rounded-r-md ${
                      propsPreset === p
                        ? "bg-surface-muted font-medium text-foreground"
                        : "text-foreground-muted hover:bg-surface-muted"
                    }`}
                  >
                    {tPb(`inspectorWidth.${p}`)}
                  </button>
                ))}
              </div>
              <CollapseToggle
                side="right"
                collapsed={false}
                onClick={togglePropsCollapsed}
                label={tPb("panel.collapseRight")}
              />
            </div>
          </div>
          <p className="text-xs text-foreground-muted">{t("propsHint")}</p>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-surface-raised p-3">
            <PropFields schema={propFields} values={propValues} onChange={editProp} />
          </div>
        </section>
      )}
    </div>
  );
}

// Viewport glyphs (same shapes as the Page Builder's selector).
function ViewportIcon({ kind }: { kind: Viewport }) {
  const p = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "desktop":
      return (
        <svg {...p}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "tablet":
      return (
        <svg {...p}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
      );
    case "mobile":
      return (
        <svg {...p}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      );
  }
}

/**
 * Bind the JSON-LD template's `{{prop}}` slots with the current placeholder
 * values and pretty-print the parsed object — the exact structured data the
 * component emits, made readable. Returns null when the bound result isn't valid
 * JSON (same gate as the renderer's buildJsonLdComponent — never preview a lie).
 * Reuses the SHARED pure binder so the preview matches production output.
 */
function previewJsonLd(
  template: string,
  propsSchemaStr: string | null,
  values: Record<string, unknown>,
): string | null {
  const raw = (template ?? "").trim();
  if (raw === "") return null;
  try {
    const bound = bindJsonLdSlots(raw, values, declaredProps(propsSchemaStr));
    const parsed = JSON.parse(bound);
    if (parsed == null || typeof parsed !== "object") return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`;
}
