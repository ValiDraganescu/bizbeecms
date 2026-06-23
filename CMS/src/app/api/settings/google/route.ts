/**
 * Per-Site Google OAuth client settings REST endpoint (cms-auth GOOGLE-CLIENT
 * REWORK, storage slice). Lets a customer store/clear THEIR OWN Google client
 * credentials in this Site's CMS — their end-users then sign in against that
 * client. Admin/Manager only (`requireUserManager` — same gate as user mgmt).
 *
 *   GET    → safe status `{ clientId, hasSecret, configured }` — NEVER the secret.
 *   PATCH  → store `{ clientId, clientSecret }` (secret encrypted at rest in D1).
 *   DELETE → clear the stored credentials.
 *
 * The KEK for secret-box is `CMS_AUTH_SECRET` (already deployer-injected). REST
 * only, no server actions (PM directive — they 500 on OpenNext/Workers). No OAuth
 * wiring here — this slice is storage + UI only.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUserManager } from "@/lib/auth/guard";
import {
  getGoogleClientConfig,
  setGoogleClientConfig,
  clearGoogleClientConfig,
} from "@/db/google-client-store";
import {
  isValidClientId,
  isValidClientSecret,
  toGoogleClientStatus,
} from "@/lib/auth/google-config";

export const dynamic = "force-dynamic";

/** Read the secret-box KEK (CMS_AUTH_SECRET) from the Worker env. */
async function kek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    const config = await getGoogleClientConfig();
    return Response.json(toGoogleClientStatus(config));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read config" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const clientId = (body as { clientId?: unknown })?.clientId;
  const clientSecret = (body as { clientSecret?: unknown })?.clientSecret;
  if (!isValidClientId(clientId) || !isValidClientSecret(clientSecret)) {
    return Response.json({ error: "invalid credentials" }, { status: 400 });
  }

  const secretKey = await kek();
  if (!secretKey) {
    return Response.json({ error: "encryption not configured" }, { status: 500 });
  }

  try {
    await setGoogleClientConfig(
      (clientId as string).trim(),
      (clientSecret as string).trim(),
      secretKey,
    );
    const config = await getGoogleClientConfig();
    return Response.json(toGoogleClientStatus(config));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to store config" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    await clearGoogleClientConfig();
    return Response.json({ cleared: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to clear config" },
      { status: 500 },
    );
  }
}
