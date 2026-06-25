import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { BUILD_TIMEOUT_MIN_KEY } from "@/db/schema";
import { coerceTimeoutMin, DEFAULT_BUILD_TIMEOUT_MIN } from "./build-timeout";

/**
 * Global build-timeout setting (app_settings key/value). The deploy path reads
 * this and combines it with a Site's optional override — see build-timeout.ts.
 */

/** The global build timeout in minutes, defaulting when unset/corrupt. */
export async function getGlobalBuildTimeoutMin(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, BUILD_TIMEOUT_MIN_KEY))
    .limit(1);
  return coerceTimeoutMin(row?.value) ?? DEFAULT_BUILD_TIMEOUT_MIN;
}

/** Upsert the global build timeout (minutes). Caller validates via coerceTimeoutMin. */
export async function setGlobalBuildTimeoutMin(min: number): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.appSettings)
    .values({ key: BUILD_TIMEOUT_MIN_KEY, value: String(min) })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: String(min) },
    });
}

/** Set (or clear, with null) a Site's per-Site build-timeout override (minutes). */
export async function setSiteBuildTimeoutMin(
  siteId: string,
  min: number | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.sites)
    .set({ buildTimeoutMin: min })
    .where(eq(schema.sites.id, siteId));
}
