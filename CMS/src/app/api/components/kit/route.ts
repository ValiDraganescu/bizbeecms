/**
 * Premade-kit install endpoint (Milestone 2, epics G1/G2).
 *
 *   GET            → the kit manifest (id + component names) so the UI can show
 *                    what each "Install … kit" button will add. No D1 read.
 *   POST {id?}     → INSTALL the kit: run EVERY bundle through the SAME import
 *                    gate (`parsePortableComponent`) and the SAME write path
 *                    (`upsertImportedComponent`) the manual `/api/components`
 *                    import uses. No new validation or write path is introduced.
 *
 * Adding a kit = ONE entry in the KITS registry below (id + builder + names).
 *
 * The kit bundles are static, authored data (`lib/components/*-kit.ts`), but
 * they are STILL re-validated here — they go through the trust boundary exactly
 * like a pasted/uploaded bundle. If we ever ship a malformed kit bundle, the
 * gate rejects it with the same errors a bad import would get (and a regression
 * test asserts every shipped bundle passes the gate offline).
 *
 * REST-only (no server actions). Live D1 write needs a real binding (HITL).
 */
import { missingComponentNames, upsertImportedComponent } from "@/db/component-store";
import { parsePortableComponent, type PortableComponent } from "@/lib/components/portable";
import { BLOG_KIT_ID, blogKit, blogKitNames } from "@/lib/components/blog-kit";
import { LANDING_KIT_ID, landingKit, landingKitNames } from "@/lib/components/landing-kit";
import { DOCS_KIT_ID, docsKit, docsKitNames } from "@/lib/components/docs-kit";
import { PORTFOLIO_KIT_ID, portfolioKit, portfolioKitNames } from "@/lib/components/portfolio-kit";
import { PRICING_KIT_ID, pricingKit, pricingKitNames } from "@/lib/components/pricing-kit";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// The kit registry — single source of truth for which kits exist.
type Kit = { id: string; build: () => PortableComponent[]; names: () => string[] };
const KITS: Kit[] = [
  { id: BLOG_KIT_ID, build: blogKit, names: blogKitNames },
  { id: LANDING_KIT_ID, build: landingKit, names: landingKitNames },
  { id: DOCS_KIT_ID, build: docsKit, names: docsKitNames },
  { id: PORTFOLIO_KIT_ID, build: portfolioKit, names: portfolioKitNames },
  { id: PRICING_KIT_ID, build: pricingKit, names: pricingKitNames },
];

// The kit manifest is a STATIC list of what kits exist (no Site data, no D1) —
// the install POST below is the privileged, gated write path.
export function GET(): Response {
  return Response.json({
    kits: KITS.map((k) => ({ id: k.id, components: k.names() })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  // Optional { id } selects a kit; default = the blog kit.
  let id = BLOG_KIT_ID;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string") {
      id = (body as { id: string }).id;
    }
  } catch {
    /* empty/invalid body → default kit */
  }

  const kit = KITS.find((k) => k.id === id);
  if (!kit) {
    return Response.json({ error: `unknown kit "${id}"` }, { status: 404 });
  }

  // 1) Re-validate every bundle through the import trust boundary FIRST, so a
  //    single bad bundle fails the whole install before any partial write.
  const validated = [];
  const assetDeps = new Set<string>();
  const componentDeps = new Set<string>();
  for (const b of kit.build()) {
    const parsed = parsePortableComponent(b);
    if (!parsed.ok) {
      return Response.json(
        { error: `kit bundle "${b.component.name}" is invalid: ${parsed.errors.join("; ")}` },
        { status: 500 },
      );
    }
    for (const k of parsed.assets) assetDeps.add(k);
    for (const d of parsed.componentDeps) componentDeps.add(d);
    validated.push(parsed.component);
  }

  // 2) Upsert each via the SAME write path as a manual import.
  try {
    const results = [];
    for (const c of validated) {
      // Tag each installed component with its source kit id so the page-builder
      // rail can group them by kit (vs individually-imported components).
      results.push(await upsertImportedComponent(c, undefined, id));
    }
    const created = results.filter((r) => r.action === "created").length;
    const updated = results.filter((r) => r.action === "updated").length;
    // Component deps the kit references but does NOT install itself (H3b), still
    // missing from this Site → warn (don't auto-install). Names the kit installs
    // are satisfied by this very install, so exclude them.
    const installedNames = new Set(validated.map((c) => c.name));
    const externalDeps = [...componentDeps].filter((n) => !installedNames.has(n));
    const missingComponents = await missingComponentNames(externalDeps);
    // Asset deps the kit references (H3) — empty for the blog kit, but surfaced
    // so a future media-bearing kit tells the user what to upload.
    return Response.json({
      id,
      installed: results,
      created,
      updated,
      assets: [...assetDeps],
      missingComponents,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to install kit" },
      { status: 500 },
    );
  }
}
