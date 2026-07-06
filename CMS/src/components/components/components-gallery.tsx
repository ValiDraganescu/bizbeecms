"use client";

/**
 * Components gallery (components-gallery redesign of the old ComponentsManager).
 *
 * A preview-led grid: every card embeds the pixel-true
 * `/preview/component/<name>` route in a scaled, lazy, pointer-events-none
 * iframe (same mechanics the Develop workbench and capture-preview use), with
 * a skeleton letter tile until it loads. The card is the pick affordance
 * (media-library-style ring + check); Export-as-ZIP and open-in-Develop are
 * quiet hover secondaries; tag editing stays but subordinate.
 *
 * ZIP export/import mirrors the site export/import: `fflate` in the browser,
 * no server zip code. A `.kit.zip` = `kit.json` (the EXISTING kit format — a
 * single component exports as a kit of 1) + `assets.json` (metadata sidecar)
 * + `assets/<key>` byte entries keyed by `asset.key` verbatim. Import unzips
 * client-side, feeds `kit.json` through the SAME gated `/api/components`
 * endpoints (preview-before-install preserved), then uploads bundled bytes
 * for keys this Site lacks via `/api/components/asset/<key>`
 * (create-if-missing; existing keys are skipped). Bare-JSON import keeps the
 * old flows unchanged, including the asset-rebind UI.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose
 * Tailwind tokens only — never raw colors.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { zipSync, unzipSync, strFromU8, strToU8, type Zippable } from "fflate";
import { applyBulkTag, distinctTags, filterByTag, normalizeTags } from "@/lib/components/tags";
import { TagChip } from "@/components/ui/tag-chip";
import {
  ASSETS_ENTRY,
  KIT_ENTRY,
  buildAssetsManifest,
  defaultKitName,
  isZipMagic,
  kitZipFilename,
  parseAssetsManifest,
  type KitAssetMeta,
} from "@/lib/components/kit-zip";

type ComponentSummary = {
  name: string;
  hasScript: boolean;
  hasCss: boolean;
  tags: string[];
  label?: string | null;
  /** updatedAt epoch — the preview iframe's `?v=` cache-bust token. */
  version: number;
};

// Preview shape returned by POST /api/components/preview (mirrors KitPreview in
// lib/components/portable.ts — kept local so this client file imports no server code).
type KitPreview = {
  name: string;
  tag: string;
  note: string;
  components: { name: string; tags: string[]; action: "create" | "update" }[];
  tags: string[];
  assets: string[];
  missingComponents: string[];
  errors: string[];
};

// Asset row shape from GET /api/assets (the fields the zip flows need).
type AssetRow = {
  key: string;
  filename: string;
  contentType: string;
  description?: string | null;
  tags?: string[];
};

// The width the preview route renders at inside each card's iframe; the frame
// is then CSS-scaled down to the card. ~desktop-ish so components lay out the
// way they will on a real page, not squeezed into a 300px column.
const PREVIEW_WIDTH = 1100;
// Card preview aspect ratio (w/h). 16:10 shows a hero-height slice.
const PREVIEW_ASPECT = 16 / 10;

// Cards mounted at once — each is a full SSR render in its iframe, so bound
// the batch and grow on demand ("Show more") instead of mounting everything.
const PAGE_SIZE = 24;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

/** Resolve the admin's effective theme so card previews match the chrome. */
function resolveTheme(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  const dark =
    attr === "dark" ||
    (attr !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? "dark" : "light";
}

/**
 * One gallery card: scaled live preview + pick affordance + quiet secondaries.
 * Local component so each card owns its iframe-loaded state (skeleton → fade).
 */
function PreviewCard({
  c,
  on,
  cardW,
  theme,
  busy,
  onToggle,
  onExport,
  tagDraft,
  onTagDraft,
  onAddTag,
  onRemoveTag,
}: {
  c: ComponentSummary;
  on: boolean;
  cardW: number;
  theme: "light" | "dark";
  busy: boolean;
  onToggle: () => void;
  onExport: () => void;
  tagDraft: string;
  onTagDraft: (v: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
}) {
  const t = useTranslations("components");
  const [loaded, setLoaded] = useState(false);
  // Theme flips remount the iframe (key below) — reset the skeleton with it.
  useEffect(() => setLoaded(false), [theme]);

  const scale = cardW > 0 ? cardW / PREVIEW_WIDTH : 0.3;
  const title = c.label || c.name;
  const kind = c.hasScript
    ? t("flagScript")
    : c.hasCss
      ? t("flagCss")
      : t("flagStatic");

  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-lg border bg-surface-raised transition-colors ${
        on ? "border-primary ring-2 ring-ring" : "border-border hover:border-primary"
      }`}
    >
      {/* Preview zone — the whole area is the pick affordance. The iframe is
          inert (pointer-events-none, tabIndex -1) under a transparent select
          button, so no interactive content nests inside a button. */}
      <div className="relative" style={{ aspectRatio: `${PREVIEW_ASPECT}` }}>
        {/* Skeleton / fallback tile: the component's initial letter. Stays
            underneath as the fallback if the preview never loads. */}
        <div
          aria-hidden
          className={`absolute inset-0 flex items-center justify-center bg-surface ${
            loaded ? "" : "motion-safe:animate-pulse"
          }`}
        >
          <span className="text-4xl font-semibold text-foreground-muted/40">
            {title.charAt(0).toUpperCase()}
          </span>
        </div>
        <iframe
          key={`${c.name}-${theme}-${c.version}`}
          src={`/preview/component/${encodeURIComponent(c.name)}?theme=${theme}&v=${c.version}`}
          title={t("previewFrame", { name: title })}
          loading="lazy"
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          className={`pointer-events-none absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{
            width: `${PREVIEW_WIDTH}px`,
            height: `${Math.round(PREVIEW_WIDTH / PREVIEW_ASPECT)}px`,
            transform: `scale(${scale})`,
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={on}
          aria-label={t("selectFor", { name: title })}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
        {/* Selection check — always visible when picked, hover-visible otherwise. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-opacity ${
            on
              ? "border-primary bg-primary text-primary-foreground opacity-100"
              : "border-border bg-surface/90 text-transparent opacity-0 group-hover:opacity-100"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        {/* Quiet secondaries on the preview, media-library style. */}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onExport}
            disabled={busy}
            aria-label={t("exportZipOne", { name: title })}
            title={t("exportZipOne", { name: title })}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
            </svg>
          </button>
          <a
            href={`/admin/components/develop?name=${encodeURIComponent(c.name)}`}
            aria-label={t("openDevelop", { name: title })}
            title={t("openDevelop", { name: title })}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
            </svg>
          </a>
        </div>
      </div>

      {/* Card footer: identity + subordinate tag editing. */}
      <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm text-foreground ${c.label ? "font-medium" : "font-mono"}`}>
            {title}
          </span>
          <span className="shrink-0 text-xs text-foreground-muted">{kind}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {c.tags.map((tg) => (
            <TagChip
              key={tg}
              label={tg}
              disabled={busy}
              removeLabel={t("removeTag", { tag: tg })}
              onRemove={() => onRemoveTag(tg)}
            />
          ))}
          <input
            list="component-tags"
            className="w-24 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground placeholder:text-foreground-muted hover:border-border focus:border-border focus:bg-surface focus-visible:outline-none"
            placeholder={t("addTagPlaceholder")}
            aria-label={t("addTagFor", { name: title })}
            value={tagDraft}
            disabled={busy}
            onChange={(e) => onTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddTag();
              }
            }}
          />
        </div>
      </div>
    </li>
  );
}

export function ComponentsGallery({
  initialComponents,
}: {
  initialComponents: ComponentSummary[];
}) {
  const t = useTranslations("components");
  const [components, setComponents] = useState<ComponentSummary[]>(initialComponents);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // H3: /media/<key> asset deps the just-imported bundle references — the target
  // Site must have these uploaded or the references dangle.
  const [assetDeps, setAssetDeps] = useState<string[]>([]);
  // H3b: nested-component refs the import/kit needs that aren't installed here.
  const [missingComponents, setMissingComponents] = useState<string[]>([]);
  // H3b part 1 — editable asset-rebind (bare-JSON single imports only; a zip
  // brings its own bytes so rebind is moot there).
  const [lastBundle, setLastBundle] = useState<string | null>(null);
  const [siteAssetKeys, setSiteAssetKeys] = useState<string[]>([]);
  // Per-dep choice: undefined/"" = keep, "__drop__" = remove, else a /media key.
  const [rebind, setRebind] = useState<Record<string, string>>({});
  // Toolbar: free-text search + tag filter + per-card add-tag drafts.
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  // Pagination: cards mounted so far; a narrowed search/filter resets the window.
  const [shown, setShown] = useState(PAGE_SIZE);
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});
  // Selection (by name) drives the sticky bar: ZIP export + bulk tag ops.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  // Which selection-bar popover is open (inputs live in panels, not the bar).
  const [panel, setPanel] = useState<"tag" | "export" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Kit metadata: optional name + description applied to the next ZIP export.
  const [kitName, setKitName] = useState("");
  const [kitNote, setKitNote] = useState("");
  // Preview-before-install: read-only summary of a pasted/unzipped kit bundle.
  const [kitPreview, setKitPreview] = useState<KitPreview | null>(null);
  // Per-component result AFTER a kit install (paste, upload, or zip).
  const [kitResult, setKitResult] = useState<{
    kit: string;
    installed: { name: string; action: "created" | "updated" }[];
    skipped: string[];
  } | null>(null);
  // ZIP export progress + ZIP import bundled bytes/metadata.
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 });
  const [zipAssets, setZipAssets] = useState<Map<string, Uint8Array> | null>(null);
  const [zipManifest, setZipManifest] = useState<KitAssetMeta[] | null>(null);
  const [assetUpload, setAssetUpload] = useState({ done: 0, total: 0 });
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Card previews match the admin chrome's theme (live: toggle + OS changes).
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const apply = () => setPreviewTheme(resolveTheme());
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", apply);
    };
  }, []);

  // All cards share one width (equal grid tracks) → measure the first card once
  // per resize and scale every preview iframe by cardW / PREVIEW_WIDTH.
  const gridRef = useRef<HTMLUListElement>(null);
  const [cardW, setCardW] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const first = el.querySelector("li");
      if (first) setCardW(first.getBoundingClientRect().width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [components.length]);

  const allTags = distinctTags(components);
  const q = search.trim().toLowerCase();
  const visible = filterByTag(components, tagFilter).filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.label ?? "").toLowerCase().includes(q) ||
      c.tags.some((tg) => tg.toLowerCase().includes(q)),
  );
  const selectedNames = components.filter((c) => selected.has(c.name)).map((c) => c.name);
  const paged = visible.slice(0, shown);

  // A new search/filter shows a new result set → restart its page window.
  useEffect(() => setShown(PAGE_SIZE), [q, tagFilter]);

  // Close the open selection-bar popover on outside click (model-picker pattern).
  useEffect(() => {
    if (!panel) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanel(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [panel]);

  async function refresh() {
    const res = await fetch("/api/components");
    if (res.ok) setComponents((await res.json()) as ComponentSummary[]);
  }

  // Persist a component's tags via the tags-only PATCH (never touches the
  // artifact). Optimistic: update local state, then re-sync from the server's
  // canonical (normalized) tags.
  async function saveTags(name: string, tags: string[]) {
    setError(null);
    try {
      const res = await fetch("/api/components", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tags }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as { name: string; tags: string[] };
      setComponents((cs) => cs.map((c) => (c.name === j.name ? { ...c, tags: j.tags } : c)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addTag(c: ComponentSummary) {
    const draft = (tagDraft[c.name] ?? "").trim();
    if (!draft) return;
    const next = normalizeTags([...c.tags, draft]);
    setTagDraft((d) => ({ ...d, [c.name]: "" }));
    void saveTags(c.name, next);
  }

  function removeTag(c: ComponentSummary, tag: string) {
    void saveTags(c.name, c.tags.filter((x) => x !== tag));
  }

  function toggleSelected(name: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Bulk tag ops: add or remove `bulkTag` across every selected component.
  // `applyBulkTag` (pure) computes only the components whose tag set actually
  // changes; we PATCH each via the existing tags-only route (no new endpoint).
  async function applyBulkTagEdit(op: "add" | "remove") {
    setError(null);
    setNotice(null);
    const tag = bulkTag.trim();
    if (!tag || selected.size === 0) return;
    const targets = components.filter((c) => selected.has(c.name));
    const changes = applyBulkTag(targets, tag, op);
    if (changes.length === 0) {
      setNotice(t("bulkNoChange", { tag }));
      return;
    }
    setBusy(true);
    try {
      for (const ch of changes) {
        const res = await fetch("/api/components", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: ch.name, tags: ch.tags }),
        });
        if (!res.ok) {
          setError(await errorOf(res));
          break;
        }
        const j = (await res.json()) as { name: string; tags: string[] };
        setComponents((cs) => cs.map((c) => (c.name === j.name ? { ...c, tags: j.tags } : c)));
      }
      setNotice(
        t(op === "add" ? "bulkAdded" : "bulkRemoved", { tag, count: changes.length }),
      );
      setBulkTag("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Load this Site's media keys so a rebind can target a real asset (H3b p1).
  async function loadSiteAssetKeys() {
    try {
      const res = await fetch("/api/assets");
      if (res.ok) {
        const rows = (await res.json()) as { key: string }[];
        setSiteAssetKeys(rows.map((r) => r.key));
      }
    } catch {
      /* gallery fetch is best-effort; rebind UI still works minus targets */
    }
  }

  /**
   * Export components as ONE `.kit.zip`: the kit bundle from the `?names=`
   * export route + `assets.json` metadata + every referenced asset's bytes
   * (fetched from the public `/media/<key>` route), zipped client-side.
   * `withMeta` applies the selection bar's optional kit name/note.
   */
  async function exportZip(names: string[], withMeta: boolean) {
    if (names.length === 0) return;
    setError(null);
    setNotice(null);
    setExportBusy(true);
    setExportProgress({ done: 0, total: 0 });
    try {
      const params = new URLSearchParams({ names: names.join(",") });
      const metaName = withMeta ? kitName.trim() : "";
      if (metaName) params.set("name", metaName);
      if (withMeta && kitNote.trim()) params.set("note", kitNote.trim());
      const res = await fetch(`/api/components/export?${params.toString()}`);
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const text = await res.text();
      const bundle = JSON.parse(text) as { assets?: string[] };
      const depKeys = Array.isArray(bundle.assets) ? bundle.assets : [];

      // Asset metadata for the sidecar (only keys this Site actually has).
      let manifest: KitAssetMeta[] = [];
      if (depKeys.length > 0) {
        const aRes = await fetch("/api/assets");
        const rows = aRes.ok ? ((await aRes.json()) as AssetRow[]) : [];
        manifest = buildAssetsManifest(depKeys, rows);
      }

      // Fetch each asset's bytes; a fetch failure drops the entry from the
      // sidecar too, so kit.zip never promises bytes it doesn't carry.
      setExportProgress({ done: 0, total: manifest.length });
      const files: Zippable = { [KIT_ENTRY]: strToU8(text) };
      const bundled: KitAssetMeta[] = [];
      const unbundled = depKeys.filter((k) => !manifest.some((m) => m.key === k));
      for (const m of manifest) {
        const r = await fetch(`/media/${m.key}`);
        if (r.ok) {
          files[m.key] = new Uint8Array(await r.arrayBuffer());
          bundled.push(m);
        } else {
          unbundled.push(m.key);
        }
        setExportProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      files[ASSETS_ENTRY] = strToU8(JSON.stringify(bundled));

      // level 0: kit.json is small, asset bytes (images) are pre-compressed.
      const zipped = zipSync(files, { level: 0 });
      downloadBlob(
        kitZipFilename(metaName || defaultKitName(names)),
        new Blob([zipped], { type: "application/zip" }),
      );
      setNotice(t("exportedZip", { components: names.length, assets: bundled.length }));
      if (unbundled.length > 0) {
        setError(t("exportUnbundled", { count: unbundled.length, keys: unbundled.join(", ") }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExportBusy(false);
    }
  }

  // Preview-before-install: a kit bundle (paste, upload, or zip) gets a
  // read-only summary (no D1 write) before the operator commits.
  function isKitBundle(text: string): boolean {
    try {
      return (JSON.parse(text) as { format?: unknown }).format === "bizbeecms.kit";
    } catch {
      return false;
    }
  }

  async function previewKit(text: string) {
    setError(null);
    setNotice(null);
    setKitPreview(null);
    if (text.trim() === "") {
      setError(t("importEmpty"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/components/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setKitPreview((await res.json()) as KitPreview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Upload the zip's bundled asset bytes for keys this Site is missing, via
   * the create-if-missing route. Returns the keys that are now present (either
   * uploaded or already here) so the deps warning can shrink to what's left.
   */
  async function uploadZipAssets(): Promise<{ present: Set<string>; failures: string[] }> {
    const present = new Set<string>();
    const failures: string[] = [];
    if (!zipAssets || !zipManifest || zipManifest.length === 0) return { present, failures };
    let existing = new Set<string>();
    try {
      const res = await fetch("/api/assets");
      if (res.ok) existing = new Set(((await res.json()) as AssetRow[]).map((r) => r.key));
    } catch {
      /* treat as nothing existing — the route still skips duplicates */
    }
    const todo = zipManifest.filter((m) => zipAssets.has(m.key));
    setUploadingAssets(true);
    setAssetUpload({ done: 0, total: todo.length });
    try {
      for (const m of todo) {
        if (existing.has(m.key)) {
          present.add(m.key);
          setAssetUpload((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }
        try {
          const bytes = zipAssets.get(m.key)!;
          const form = new FormData();
          form.append(
            "file",
            new File([bytes.slice().buffer as ArrayBuffer], m.filename, { type: m.contentType }),
          );
          if (m.description) form.append("description", m.description);
          if (m.tags.length > 0) form.append("tags", JSON.stringify(m.tags));
          const up = await fetch(`/api/components/asset/${m.key}`, { method: "POST", body: form });
          if (up.ok) present.add(m.key);
          else failures.push(m.key);
        } catch {
          failures.push(m.key);
        }
        setAssetUpload((p) => ({ ...p, done: p.done + 1 }));
      }
    } finally {
      setUploadingAssets(false);
    }
    return { present, failures };
  }

  // `rebindMap` (H3b p1): re-import the SAME bundle with a {oldKey: newKey|null}
  // map applied. The server route + pure validator already accept {rebind}.
  async function importBundle(text: string, rebindMap?: Record<string, string | null>) {
    setError(null);
    setNotice(null);
    setAssetDeps([]);
    setMissingComponents([]);
    setKitPreview(null);
    setKitResult(null);
    if (text.trim() === "") {
      setError(t("importEmpty"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rebindMap ? { text, rebind: rebindMap } : { text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as {
        // Single-component import.
        action?: "created" | "updated";
        name?: string;
        // Kit import: many components in one step.
        kit?: string;
        installed?: { name: string; action: "created" | "updated" }[];
        created?: number;
        updated?: number;
        skipped?: string[];
        assets?: string[];
        missingComponents?: string[];
      };
      let deps = j.assets ?? [];
      if (j.kit !== undefined) {
        let noticeText =
          t("kitImported", { kit: j.kit, created: j.created ?? 0, updated: j.updated ?? 0 }) +
          ((j.skipped?.length ?? 0) > 0 ? " " + t("kitSkipped", { count: j.skipped!.length }) : "");
        // ZIP import: the bundle brought its asset bytes — install the missing
        // ones now, then only the still-unresolved deps stay as a warning.
        if (zipAssets) {
          const { present, failures } = await uploadZipAssets();
          deps = deps.filter((k) => !present.has(k));
          noticeText += " " + t("assetsInstalled", { count: present.size });
          if (failures.length > 0) {
            setError(t("assetsInstallFailed", { count: failures.length, keys: failures.join(", ") }));
          }
        }
        setNotice(noticeText);
        setKitResult({ kit: j.kit, installed: j.installed ?? [], skipped: j.skipped ?? [] });
        setLastBundle(null); // a kit has no single re-importable bundle
      } else {
        setNotice(
          j.action === "created"
            ? t("imported", { name: j.name ?? "" })
            : t("updated", { name: j.name ?? "" }),
        );
        // Keep the bundle source + reset rebind choices so the (possibly still
        // dangling) deps can be rebound and re-imported again.
        setLastBundle(text);
      }
      setAssetDeps(deps);
      setMissingComponents(j.missingComponents ?? []);
      setRebind({});
      void loadSiteAssetKeys();
      setPaste("");
      setZipAssets(null);
      setZipManifest(null);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Build the rebind map from the per-dep choices and re-import the bundle.
  function applyRebind() {
    if (!lastBundle) return;
    const map: Record<string, string | null> = {};
    for (const [key, choice] of Object.entries(rebind)) {
      if (choice === "__drop__") map[key] = null;
      else if (choice) map[key] = choice;
    }
    void importBundle(lastBundle, map);
  }

  // Load the picked file into the paste box (do NOT import yet) so the same
  // Preview/Import buttons apply to uploads just like pastes. A `.kit.zip` is
  // unzipped client-side: `kit.json` becomes the paste text; the asset bytes +
  // `assets.json` sidecar are held for the post-install upload leg.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKitPreview(null);
    setError(null);
    setNotice(null);
    setZipAssets(null);
    setZipManifest(null);
    try {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (file.name.toLowerCase().endsWith(".zip") || isZipMagic(head)) {
        const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const kit = unzipped[KIT_ENTRY];
        if (!kit) {
          setError(t("zipMissingKit"));
          return;
        }
        setPaste(strFromU8(kit));
        const sidecar = unzipped[ASSETS_ENTRY];
        setZipManifest(sidecar ? parseAssetsManifest(strFromU8(sidecar)) : []);
        const bytes = new Map<string, Uint8Array>();
        for (const [key, data] of Object.entries(unzipped)) {
          if (key !== KIT_ENTRY && key !== ASSETS_ENTRY) bytes.set(key, data);
        }
        setZipAssets(bytes);
      } else {
        setPaste(await file.text());
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-success bg-surface-raised px-3 py-2 text-success"
        >
          {notice}
        </p>
      )}
      {uploadingAssets && (
        <p role="status" className="text-sm text-foreground-muted" aria-live="polite">
          {t("assetsInstalling", { done: assetUpload.done, total: assetUpload.total })}
        </p>
      )}

      {/* Editable rebind (H3b part 1): after a bare-JSON import, let the admin
          keep / repoint / drop each referenced asset, then re-import. */}
      {assetDeps.length > 0 && lastBundle && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised px-3 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{t("rebindTitle")}</span>
            <span className="text-sm text-foreground-muted">{t("rebindHint")}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {assetDeps.map((k) => {
              const present = siteAssetKeys.includes(k);
              return (
                <li key={k} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-sm text-foreground">/media/{k}</span>
                    <span className={`text-xs ${present ? "text-success" : "text-danger"}`}>
                      {present ? t("rebindPresent") : t("rebindMissing")}
                    </span>
                  </div>
                  <select
                    className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                    value={rebind[k] ?? ""}
                    disabled={busy}
                    aria-label={`/media/${k}`}
                    onChange={(e) => setRebind((r) => ({ ...r, [k]: e.target.value }))}
                  >
                    <option value="">{t("rebindKeep")}</option>
                    <option value="__drop__">{t("rebindDrop")}</option>
                    {siteAssetKeys.length > 0 && (
                      <optgroup label={t("rebindToLabel")}>
                        {siteAssetKeys.map((sk) => (
                          <option key={sk} value={sk}>
                            /media/{sk}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => applyRebind()}
          >
            {busy ? t("applyingRebind") : t("applyRebind")}
          </button>
        </div>
      )}
      {/* Read-only deps list for kit installs / zip imports (no single bundle to
          re-import; zip imports already uploaded what they carried). */}
      {assetDeps.length > 0 && !lastBundle && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">{t("assetDepsTitle")}</span>
          <span className="text-sm text-foreground-muted">{t("assetDepsHint")}</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {assetDeps.map((k) => (
              <li key={k} className="truncate font-mono text-sm text-foreground-muted">
                /media/{k}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missingComponents.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-danger bg-danger-subtle px-3 py-2"
        >
          <span className="text-sm font-medium text-danger">{t("componentDepsTitle")}</span>
          <span className="text-sm text-danger">{t("componentDepsHint")}</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {missingComponents.map((n) => (
              <li key={n} className="truncate font-mono text-sm text-danger">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Per-component kit-install result — what landed (created/updated) and
          what was skipped (with the validation reason). */}
      {kitResult && (kitResult.installed.length > 0 || kitResult.skipped.length > 0) && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">
            {t("kitResultTitle", { kit: kitResult.kit })}
          </span>
          {kitResult.installed.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {kitResult.installed.map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-sm">
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-xs font-medium " +
                      (c.action === "created"
                        ? "bg-success-subtle text-success"
                        : "bg-surface text-foreground-muted")
                    }
                  >
                    {c.action === "created" ? t("resultCreated") : t("resultUpdated")}
                  </span>
                  <span className="truncate font-mono text-foreground">{c.name}</span>
                </li>
              ))}
            </ul>
          )}
          {kitResult.skipped.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-danger">{t("resultSkippedTitle")}</span>
              <ul className="flex flex-col gap-0.5">
                {kitResult.skipped.map((reason, i) => (
                  <li key={i} className="text-sm text-danger">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── The gallery: toolbar + preview-card grid + sticky selection bar ── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("listTitle")}</h2>
          <span className="text-sm text-foreground-muted">
            {t("galleryCount", { count: components.length })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              type="search"
              className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {allTags.length > 0 && (
              <select
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                aria-label={t("filterByTag")}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">{t("filterAllTags")}</option>
                {allTags.map((tg) => (
                  <option key={tg} value={tg}>
                    {tg}
                  </option>
                ))}
              </select>
            )}
            {visible.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-foreground-muted">
                <input
                  type="checkbox"
                  className="accent-primary"
                  disabled={busy}
                  aria-label={t("selectAll")}
                  checked={visible.length > 0 && visible.every((c) => selected.has(c.name))}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      for (const c of visible) {
                        if (e.target.checked) next.add(c.name);
                        else next.delete(c.name);
                      }
                      return next;
                    })
                  }
                />
                {t("selectAll")}
              </label>
            )}
          </div>
        </div>

        {/* Shared autocomplete source for all per-card add-tag inputs. */}
        <datalist id="component-tags">
          {allTags.map((tg) => (
            <option key={tg} value={tg} />
          ))}
        </datalist>

        {components.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-raised px-4 py-8 text-center text-foreground-muted">
            {t("empty")}
          </p>
        ) : visible.length === 0 ? (
          <p className="text-foreground-muted">{q ? t("noneForSearch") : t("noneForTag")}</p>
        ) : (
          <ul
            ref={gridRef}
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          >
            {paged.map((c) => (
              <PreviewCard
                key={c.name}
                c={c}
                on={selected.has(c.name)}
                cardW={cardW}
                theme={previewTheme}
                busy={busy || exportBusy}
                onToggle={() => toggleSelected(c.name)}
                onExport={() => void exportZip([c.name], false)}
                tagDraft={tagDraft[c.name] ?? ""}
                onTagDraft={(v) => setTagDraft((d) => ({ ...d, [c.name]: v }))}
                onAddTag={() => addTag(c)}
                onRemoveTag={(tg) => removeTag(c, tg)}
              />
            ))}
          </ul>
        )}

        {/* Grow the page window; selection/select-all always cover the whole
            filtered set, not just the mounted cards. */}
        {visible.length > shown && (
          <button
            type="button"
            className="self-center rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-raised"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            {t("showMore", { count: visible.length - shown })}
          </button>
        )}

        {/* Sticky selection bar. Two clear affordances — Tag… and Export — as
            buttons whose inputs live in small popovers above the bar (the bar
            sits at the viewport bottom, so panels open upward). Keeps the rare
            inputs (kit name/note, bulk tag) out of the always-visible row. */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 shadow-lg">
            <span className="text-sm font-medium text-foreground">
              {t("bulkSelected", { count: selected.size })}
            </span>
            <button
              type="button"
              className="text-sm text-foreground-muted hover:text-foreground disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                setSelected(new Set());
                setPanel(null);
              }}
            >
              {t("bulkClear")}
            </button>
            <div
              ref={panelRef}
              className="ml-auto flex items-center gap-2"
              onKeyDown={(e) => {
                if (e.key === "Escape") setPanel(null);
              }}
            >
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={panel === "tag"}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setPanel(panel === "tag" ? null : "tag")}
                >
                  {t("tagButton")}
                </button>
                {panel === "tag" && (
                  <div
                    role="dialog"
                    aria-label={t("tagButton")}
                    className="absolute bottom-full right-0 mb-2 flex w-72 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
                  >
                    <input
                      list="component-tags"
                      autoFocus
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                      placeholder={t("bulkTagPlaceholder")}
                      aria-label={t("bulkTagPlaceholder")}
                      value={bulkTag}
                      disabled={busy}
                      onChange={(e) => setBulkTag(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-surface disabled:opacity-40"
                        disabled={busy || !bulkTag.trim()}
                        onClick={() => {
                          setPanel(null);
                          void applyBulkTagEdit("add");
                        }}
                      >
                        {t("bulkAdd")}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-surface disabled:opacity-40"
                        disabled={busy || !bulkTag.trim()}
                        onClick={() => {
                          setPanel(null);
                          void applyBulkTagEdit("remove");
                        }}
                      >
                        {t("bulkRemove")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={panel === "export"}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                  disabled={exportBusy || busy}
                  onClick={() => setPanel(panel === "export" ? null : "export")}
                >
                  {exportBusy
                    ? t("exportingZip", { done: exportProgress.done, total: exportProgress.total })
                    : t("exportZipSelected", { count: selected.size })}
                </button>
                {panel === "export" && (
                  <div
                    role="dialog"
                    aria-label={t("exportZipSelected", { count: selected.size })}
                    className="absolute bottom-full right-0 mb-2 flex w-72 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
                  >
                    <input
                      type="text"
                      autoFocus
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                      placeholder={t("kitNameLabel")}
                      aria-label={t("kitNameLabel")}
                      value={kitName}
                      onChange={(e) => setKitName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setPanel(null);
                          void exportZip(selectedNames, true);
                        }
                      }}
                    />
                    <input
                      type="text"
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                      placeholder={t("kitNotePlaceholder")}
                      aria-label={t("kitNoteLabel")}
                      value={kitNote}
                      onChange={(e) => setKitNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setPanel(null);
                          void exportZip(selectedNames, true);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="self-end rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                      disabled={exportBusy}
                      onClick={() => {
                        setPanel(null);
                        void exportZip(selectedNames, true);
                      }}
                    >
                      {t("downloadZip")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Kit preview (preview-before-install): a read-only summary of a kit
          bundle — what it would create/update + its tags + missing deps —
          with a Confirm install that runs the SAME gated import path. */}
      {kitPreview && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised px-3 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {t("previewTitle", { name: kitPreview.name })}
            </span>
            {kitPreview.note && (
              <span className="text-sm text-foreground-muted">{kitPreview.note}</span>
            )}
            <span className="text-sm text-foreground-muted">
              {t("previewCount", { count: kitPreview.components.length })}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {kitPreview.components.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground">{c.name}</span>
                <span className="text-xs text-foreground-muted">
                  {c.action === "create" ? t("previewCreate") : t("previewUpdate")}
                </span>
                {c.tags.map((tg) => (
                  <TagChip key={tg} label={tg} />
                ))}
              </li>
            ))}
          </ul>
          {kitPreview.missingComponents.length > 0 && (
            <span className="text-sm text-danger">
              {t("previewMissingDeps", { deps: kitPreview.missingComponents.join(", ") })}
            </span>
          )}
          {kitPreview.assets.length > 0 && (
            <span className="text-sm text-foreground-muted">
              {zipAssets
                ? t("previewAssetsBundled", { count: kitPreview.assets.length })
                : t("previewAssets", { count: kitPreview.assets.length })}
            </span>
          )}
          {kitPreview.errors.length > 0 && (
            <span className="text-sm text-danger">
              {t("previewSkipped", { count: kitPreview.errors.length })}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={busy}
              onClick={() => void importBundle(paste)}
            >
              {busy ? t("importing") : t("previewConfirm")}
            </button>
            <button
              type="button"
              className="self-start rounded-md border border-border px-4 py-2 text-foreground hover:bg-surface disabled:opacity-50"
              disabled={busy}
              onClick={() => setKitPreview(null)}
            >
              {t("previewCancel")}
            </button>
          </div>
        </div>
      )}

      {/* Import: upload (.kit.zip or .json) or paste — at the bottom, mirroring
          the site export/import page's order. */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-foreground">{t("importTitle")}</h2>
        <p className="text-sm text-foreground-muted">{t("importHint")}</p>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">{t("uploadLabel")}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip,application/json,.json"
            className="text-sm text-foreground file:mr-3 file:rounded file:border file:border-border file:bg-surface file:px-3 file:py-1 file:text-foreground"
            onChange={(e) => void onFile(e)}
            disabled={busy}
          />
        </label>
        {zipAssets && (
          <p className="text-sm text-foreground-muted" role="status">
            {t("zipLoaded", { count: zipAssets.size })}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">{t("pasteLabel")}</span>
          <textarea
            className="h-40 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setKitPreview(null);
              // Hand-edited text no longer matches the zip's bytes — drop them.
              setZipAssets(null);
              setZipManifest(null);
            }}
            placeholder={t("pastePlaceholder")}
            disabled={busy}
            aria-label={t("pasteLabel")}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {/* A kit bundle gets a Preview button; everything else imports directly. */}
          {isKitBundle(paste) && (
            <button
              type="button"
              className="self-start rounded-md border border-border px-4 py-2 text-foreground hover:bg-surface disabled:opacity-50"
              disabled={busy}
              onClick={() => void previewKit(paste)}
            >
              {t("previewKit")}
            </button>
          )}
          <button
            type="button"
            className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void importBundle(paste)}
          >
            {busy ? t("importing") : t("import")}
          </button>
        </div>
      </section>
    </div>
  );
}
