import { eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AI_CREDIT_POOL_USD_KEY, AI_CURATED_MODELS_KEY } from "@/db/schema";
import {
  SEED_CURATED_PURPOSES,
  checkQuotasWithinPool,
  oversellMessage,
  parseCuratedPurposes,
  readPoolUsd,
  type CuratedPurposes,
} from "./curated";

/**
 * Persistence for the curated AI config (app_settings key/value — no migration
 * needed, same store as the global build timeout). Pure parsing/validation lives
 * in ./curated.ts; this file is only the D1 read/write edge.
 */

async function readSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
}

/**
 * The curated catalog. Absent/corrupt on first read → the seed is PERSISTED and
 * returned, so the fleet and the curation UI start from the same rows and an
 * operator's first edit is a diff against something real.
 */
export async function getCuratedPurposes(): Promise<CuratedPurposes> {
  const parsed = parseCuratedPurposes(await readSetting(AI_CURATED_MODELS_KEY));
  if (parsed) return parsed;
  await setCuratedPurposes(SEED_CURATED_PURPOSES);
  return SEED_CURATED_PURPOSES;
}

/** Replace the curated catalog. Caller normalizes via normalizeCuratedPurposes. */
export async function setCuratedPurposes(purposes: CuratedPurposes): Promise<void> {
  await writeSetting(AI_CURATED_MODELS_KEY, JSON.stringify(purposes));
}

/** The global monthly credit pool in USD; null = unset (no oversell constraint). */
export async function getCreditPoolUsd(): Promise<number | null> {
  return readPoolUsd(await readSetting(AI_CREDIT_POOL_USD_KEY));
}

/** Set the pool (USD), or clear it with null. */
export async function setCreditPoolUsd(poolUsd: number | null): Promise<void> {
  await writeSetting(AI_CREDIT_POOL_USD_KEY, poolUsd == null ? "" : String(poolUsd));
}

/** Every site's monthly quota (null = unset), optionally excluding one site. */
async function listSiteQuotasUsd(excludeSiteId?: string): Promise<(number | null)[]> {
  const db = await getDb();
  const rows = await db
    .select({ quota: schema.sites.openrouterMonthlyLimitUsd })
    .from(schema.sites)
    .where(excludeSiteId ? ne(schema.sites.id, excludeSiteId) : undefined);
  return rows.map((r) => r.quota);
}

/**
 * No-oversell gate (design decision 3), shared by the two writes that can break
 * it: a site's quota PATCH and a pool edit. Returns an error message when the
 * proposed state would oversell the pool, else null.
 *
 * `siteId`/`quotaUsd`: the site whose quota is changing — it is excluded from
 * the DB sum and its PROPOSED value added instead. Omit for a pool-only edit.
 * `poolUsd`: the proposed pool; omit to validate against the stored one.
 */
export async function checkOversell(change: {
  siteId?: string;
  quotaUsd?: number | null;
  poolUsd?: number | null;
}): Promise<string | null> {
  const poolUsd =
    change.poolUsd !== undefined ? change.poolUsd : await getCreditPoolUsd();
  if (poolUsd == null) return null; // no pool configured → no constraint

  const others = await listSiteQuotasUsd(change.siteId);
  const quotas = change.siteId ? [...others, change.quotaUsd ?? null] : others;

  const over = checkQuotasWithinPool(quotas, poolUsd);
  return over ? oversellMessage(over) : null;
}
