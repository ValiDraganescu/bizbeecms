import { getDb, schema } from "@/db";
import type { PasswordReset } from "@/db/schema";

/** Reset-token lifetime: 7 days (mirrors the invite TTL). */
export const RESET_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Opaque, URL-safe reset token (32 random bytes, hex). */
export function newResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mint a single-use, time-boxed password-reset row for a user. */
export async function createPasswordReset(userId: string): Promise<PasswordReset> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.passwordReset)
    .values({
      id: crypto.randomUUID(),
      userId,
      token: newResetToken(),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    })
    .returning();
  return row;
}
