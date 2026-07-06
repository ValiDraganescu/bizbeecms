/**
 * CMS per-Site theme FONTS settings REST endpoint (theme-fonts).
 *
 * GET → the stored `ThemeFonts` (slot picks + self-hosted faces).
 * PUT { slots } → pick catalog families for the body/heading/accent slots.
 *
 * SELF-HOSTING happens here, at save time: for each picked family the route
 * fetches Google's css2 stylesheet, downloads the latin/latin-ext WOFF2 files,
 * and stores them as R2 assets — visitors' browsers only ever load
 * `/media/<key>` (first-party; no Google at page-load time; GDPR-clean).
 * Faces already stored for a kept family are REUSED (matched by family/weight/
 * style/range), so re-saving doesn't re-download or duplicate R2 objects.
 * Faces of families no longer picked are dropped from the config (their R2
 * bytes are left behind — a later save reusing the family can't dangle, and
 * orphaned WOFF2s are ~30KB; garbage-collect if it ever matters).
 *
 * The slot → family map is validated against the curated FONT_CATALOG (the
 * trust boundary: arbitrary families would mean arbitrary fetch targets).
 * REST-only, no server actions (PM directive).
 */
import { getThemeFonts, setThemeFonts } from "@/db/settings-store";
import { putAsset } from "@/db/asset-store";
import { buildAssetKey } from "@/lib/render/asset";
import {
  FONT_SLOTS,
  type FontFace,
  type ThemeFonts,
  catalogFont,
  isFontSlot,
} from "@/lib/render/fonts";
import {
  CSS2_USER_AGENT,
  buildCss2Url,
  hostedFaces,
  parseCss2,
} from "@/lib/settings/google-fonts";
import { requireAdmin } from "@/lib/auth/guard";
import { PAGES_CACHE_TAG } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await getThemeFonts());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load theme fonts" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Validate the slot picks against the catalog BEFORE any network call —
  // name the exact bad token and the fix (error philosophy).
  const rawSlots =
    body && typeof body === "object" && !Array.isArray(body)
      ? ((body as { slots?: unknown }).slots as Record<string, unknown> | undefined)
      : undefined;
  const slots: ThemeFonts["slots"] = {};
  if (rawSlots && typeof rawSlots === "object" && !Array.isArray(rawSlots)) {
    for (const [k, v] of Object.entries(rawSlots)) {
      if (v == null) continue;
      if (!isFontSlot(k)) {
        return Response.json(
          { error: `unknown font slot "${k}" — use one of: ${FONT_SLOTS.join(", ")}` },
          { status: 400 },
        );
      }
      const family = (v as { family?: unknown }).family;
      if (typeof family !== "string" || !catalogFont(family)) {
        return Response.json(
          { error: `unknown font family ${JSON.stringify(family)} for slot "${k}" — pick a family from the catalog` },
          { status: 400 },
        );
      }
      slots[k] = { family };
    }
  }

  try {
    const current = await getThemeFonts();
    const families = [...new Set(Object.values(slots).map((s) => s.family))];
    const faces: FontFace[] = [];
    for (const family of families) {
      faces.push(...(await resolveFamilyFaces(family, current.faces)));
    }
    const saved = await setThemeFonts({ slots, faces });
    // Theme fonts restyle EVERY published page — blast the shared tag. Best-effort.
    await purgeEdgeTags(PAGES_CACHE_TAG);
    return Response.json(saved);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save theme fonts" },
      { status: 502 },
    );
  }
}

/**
 * The self-hosted faces for one catalog family: reuse already-stored R2 keys
 * where the variant matches, download + store the rest. Throws with the family
 * name on any fetch failure (the PUT is all-or-nothing; nothing was saved yet).
 */
async function resolveFamilyFaces(
  family: string,
  stored: FontFace[],
): Promise<FontFace[]> {
  const cat = catalogFont(family);
  if (!cat) throw new Error(`"${family}" is not in the font catalog`);

  const cssRes = await fetch(buildCss2Url(family, cat.weights), {
    headers: { "User-Agent": CSS2_USER_AGENT },
  });
  if (!cssRes.ok) {
    throw new Error(`Google Fonts css2 request failed for "${family}" (HTTP ${cssRes.status})`);
  }
  const remote = hostedFaces(parseCss2(await cssRes.text()));
  if (remote.length === 0) {
    throw new Error(`no downloadable latin/latin-ext faces found for "${family}"`);
  }

  const out: FontFace[] = [];
  for (const r of remote) {
    const existing = stored.find(
      (f) =>
        f.family === family &&
        f.weight === r.weight &&
        f.style === r.style &&
        (f.unicodeRange ?? "") === (r.unicodeRange ?? ""),
    );
    if (existing) {
      out.push(existing);
      continue;
    }
    const fileRes = await fetch(r.url);
    if (!fileRes.ok) {
      throw new Error(`WOFF2 download failed for "${family}" ${r.weight} (HTTP ${fileRes.status})`);
    }
    const bytes = await fileRes.arrayBuffer();
    const key = buildAssetKey(
      `font ${family} ${r.weight} ${r.style} ${r.subset}.woff2`,
      "font/woff2",
      crypto.randomUUID().slice(0, 8),
    );
    await putAsset({
      key,
      filename: `${family} ${r.weight} ${r.style} (${r.subset}).woff2`,
      contentType: "font/woff2",
      bytes,
      description: `Theme font: ${family} ${r.weight} ${r.style}, ${r.subset} subset`,
    });
    const face: FontFace = { family, weight: r.weight, style: r.style, key };
    if (r.unicodeRange) face.unicodeRange = r.unicodeRange;
    out.push(face);
  }
  return out;
}
