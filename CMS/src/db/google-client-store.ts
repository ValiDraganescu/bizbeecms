/**
 * Per-Site Google OAuth client credentials in the CMS's own D1 (cms-auth
 * GOOGLE-CLIENT REWORK). Stored as ONE `site_settings` row keyed `google_client`
 * holding `{ clientId, clientSecretEnc }` — the id plaintext (not a secret), the
 * secret AES-GCM-encrypted via `lib/crypto/secret-box` (REWORK decision 1).
 *
 * The KEK is the caller-supplied base64 key (the route reads `CMS_AUTH_SECRET`);
 * the store stays free of CF-env coupling so it's node-testable over an in-memory
 * D1 via `injectedDb` (the settings-store / invite-store pattern). Reads D1 ONLY
 * via the `Db` port (`getDb()`), never `env.DB` — keeps the sole-reader guard green.
 *
 * Pure validation + the "configured" decision live in `lib/auth/google-config.ts`.
 */
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import { decryptSecret, encryptSecret } from "../lib/crypto/secret-box.ts";
import {
  type GoogleClientConfig,
  emptyGoogleClientConfig,
  normalizeGoogleClientConfig,
} from "../lib/auth/google-config.ts";

const GOOGLE_CLIENT_KEY = "google_client";

/** Read the stored config (id + encrypted secret), or empty if unset/garbage. */
export async function getGoogleClientConfig(
  injectedDb?: Db,
): Promise<GoogleClientConfig> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, GOOGLE_CLIENT_KEY))
    .limit(1);
  const raw = rows[0]?.value;
  if (!raw) return emptyGoogleClientConfig();
  try {
    return normalizeGoogleClientConfig(JSON.parse(raw));
  } catch {
    return emptyGoogleClientConfig();
  }
}

/** Upsert the `google_client` settings row. Shared by set/clear. */
async function upsert(value: string, db: Db): Promise<void> {
  const now = new Date();
  const existing = await db
    .select({ key: schema.siteSettings.key })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, GOOGLE_CLIENT_KEY))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(schema.siteSettings)
      .set({ value, updatedAt: now })
      .where(eq(schema.siteSettings.key, GOOGLE_CLIENT_KEY));
  } else {
    await db
      .insert(schema.siteSettings)
      .values({ key: GOOGLE_CLIENT_KEY, value, updatedAt: now });
  }
}

/**
 * Store a new client id + secret. Encrypts the secret with `kek` before write —
 * the plaintext secret never touches D1. The id is trimmed/stored as given.
 */
export async function setGoogleClientConfig(
  clientId: string,
  clientSecret: string,
  kek: string,
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  const clientSecretEnc = await encryptSecret(clientSecret, kek);
  const config: GoogleClientConfig = { clientId: clientId.trim(), clientSecretEnc };
  await upsert(JSON.stringify(config), db);
}

/** Remove the stored config (clear button) — sets it back to empty. */
export async function clearGoogleClientConfig(injectedDb?: Db): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await upsert(JSON.stringify(emptyGoogleClientConfig()), db);
}

/**
 * Decrypt the stored client secret with `kek`, or null if unset / decrypt fails.
 * Used by the OAuth routes (a later slice). A decrypt failure (wrong key /
 * tampered) returns null — callers treat it as "not configured", NEVER a 500.
 */
export async function getDecryptedClientSecret(
  kek: string,
  injectedDb?: Db,
): Promise<string | null> {
  const config = await getGoogleClientConfig(injectedDb);
  if (!config.clientSecretEnc) return null;
  try {
    return await decryptSecret(config.clientSecretEnc, kek);
  } catch {
    return null;
  }
}
