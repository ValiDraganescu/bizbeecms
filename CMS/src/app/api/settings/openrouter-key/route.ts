/**
 * Per-Site CMS-local OpenRouter user-key REST endpoint (ai-openrouter KEY-MINTING
 * track, "CMS-local user-key override" slice). Lets a Site operator store/clear
 * THEIR OWN OpenRouter key in this Site's CMS; it's preferred at AI request time
 * over the deployer-injected `OPENROUTER_API_KEY`. Admin/Manager only
 * (`requireUserManager` — same gate as the Google client + user mgmt).
 *
 *   GET    → safe status `{ hasKey }` — NEVER the key.
 *   PATCH  → store `{ key }` (encrypted at rest in D1).
 *   DELETE → clear the stored key.
 *
 * KEK for secret-box is `CMS_AUTH_SECRET` (already deployer-injected). REST only,
 * no server actions (PM directive — they 500 on OpenNext/Workers).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUserManager } from "@/lib/auth/guard";
import {
  getOpenrouterUserKeyConfig,
  setOpenrouterUserKey,
  clearOpenrouterUserKey,
} from "@/db/openrouter-key-store";
import {
  isValidUserKey,
  toOpenrouterUserKeyStatus,
} from "@/lib/settings/openrouter-key";

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
    const config = await getOpenrouterUserKeyConfig();
    return Response.json(toOpenrouterUserKeyStatus(config));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read key" },
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
  const key = (body as { key?: unknown })?.key;
  if (!isValidUserKey(key)) {
    return Response.json({ error: "invalid OpenRouter key" }, { status: 400 });
  }

  const secretKey = await kek();
  if (!secretKey) {
    return Response.json({ error: "encryption not configured" }, { status: 500 });
  }

  try {
    await setOpenrouterUserKey((key as string).trim(), secretKey);
    const config = await getOpenrouterUserKeyConfig();
    return Response.json(toOpenrouterUserKeyStatus(config));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to store key" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    await clearOpenrouterUserKey();
    return Response.json({ cleared: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to clear key" },
      { status: 500 },
    );
  }
}
