/**
 * CMS-local OpenRouter user-key in the CMS's own D1 (ai-openrouter KEY-MINTING
 * track, "CMS-local user-key override" slice). Stored as ONE `site_settings` row
 * keyed `openrouter_user_key` holding `{ keyEnc }` — the key AES-GCM-encrypted
 * via `lib/crypto/secret-box`. Mirrors `google-client-store.ts` verbatim.
 *
 * The KEK is the caller-supplied base64 key (the route reads `CMS_AUTH_SECRET`);
 * the store stays free of CF-env coupling so it's node-testable over an in-memory
 * D1 via `injectedDb` (the settings-store pattern). Reads D1 ONLY via the `Db`
 * port (`getDb()`), never `env.DB` — keeps the sole-reader guard green.
 *
 * Pure validation + status live in `lib/settings/openrouter-key.ts`.
 */
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import { decryptSecret, encryptSecret } from "../lib/crypto/secret-box.ts";
import {
  type OpenrouterUserKeyConfig,
  emptyOpenrouterUserKey,
  normalizeOpenrouterUserKey,
} from "../lib/settings/openrouter-key.ts";

const OPENROUTER_USER_KEY = "openrouter_user_key";

/** Read the stored config (encrypted key), or empty if unset/garbage. */
export async function getOpenrouterUserKeyConfig(
  injectedDb?: Db,
): Promise<OpenrouterUserKeyConfig> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, OPENROUTER_USER_KEY))
    .limit(1);
  const raw = rows[0]?.value;
  if (!raw) return emptyOpenrouterUserKey();
  try {
    return normalizeOpenrouterUserKey(JSON.parse(raw));
  } catch {
    return emptyOpenrouterUserKey();
  }
}

/** Upsert the `openrouter_user_key` settings row. Shared by set/clear. */
async function upsert(value: string, db: Db): Promise<void> {
  const now = new Date();
  const existing = await db
    .select({ key: schema.siteSettings.key })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, OPENROUTER_USER_KEY))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(schema.siteSettings)
      .set({ value, updatedAt: now })
      .where(eq(schema.siteSettings.key, OPENROUTER_USER_KEY));
  } else {
    await db
      .insert(schema.siteSettings)
      .values({ key: OPENROUTER_USER_KEY, value, updatedAt: now });
  }
}

/**
 * Store a new user key. Encrypts it with `kek` before write — the plaintext key
 * never touches D1. The key is trimmed.
 */
export async function setOpenrouterUserKey(
  key: string,
  kek: string,
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  const keyEnc = await encryptSecret(key.trim(), kek);
  await upsert(JSON.stringify({ keyEnc } satisfies OpenrouterUserKeyConfig), db);
}

/** Remove the stored key (clear button) — sets it back to empty. */
export async function clearOpenrouterUserKey(injectedDb?: Db): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await upsert(JSON.stringify(emptyOpenrouterUserKey()), db);
}

/**
 * Decrypt the stored user key with `kek`, or null if unset / decrypt fails. Used
 * by `getAi()` at request time. A decrypt failure (wrong key / tampered) returns
 * null — callers fall back to the env key, NEVER a 500.
 */
export async function getDecryptedOpenrouterUserKey(
  kek: string,
  injectedDb?: Db,
): Promise<string | null> {
  const config = await getOpenrouterUserKeyConfig(injectedDb);
  if (!config.keyEnc) return null;
  try {
    return await decryptSecret(config.keyEnc, kek);
  } catch {
    return null;
  }
}
