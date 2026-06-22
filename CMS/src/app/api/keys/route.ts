/**
 * CMS API-key management REST endpoint (cms-mcp Slice 4).
 *
 * These keys are the bearer credentials for the remote MCP server (`/mcp`): each
 * authorizes the ONE Site this Worker serves (D1 is the boundary). Admin-only
 * (`requireApiKeyManager` → Admin+ in the cms-auth role model) — a key grants the
 * full tool set, so it sits a tier above user management.
 *
 *   GET    → list keys (label, prefix, created/lastUsed/revoked) — NEVER secrets.
 *   POST   → mint a key; returns the plaintext ONCE (`{ key, item }`).
 *   DELETE → revoke by id (`?id=` query, or `{ id }` body).
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Live D1 needs a real binding (HITL); only the validate/guard
 * paths are exercisable offline.
 */
import { listApiKeys, createApiKey, revokeApiKey } from "@/db/api-key-store";
import { isValidLabel, normalizeLabel } from "@/lib/auth/api-key-core";
import { requireApiKeyManager, checkAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireApiKeyManager(request);
  if (denied) return denied;
  try {
    return Response.json(await listApiKeys());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireApiKeyManager(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const label = normalizeLabel((body as { label?: unknown })?.label);
  if (!isValidLabel(label)) {
    return Response.json({ error: "invalid label" }, { status: 400 });
  }

  // Stamp who minted it (the signed-in admin) for the audit list.
  const who = await checkAdmin(request);
  const createdBy = who.allow ? who.userId ?? null : null;

  try {
    return Response.json(await createApiKey(label, createdBy));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to create key" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireApiKeyManager(request);
  if (denied) return denied;

  let id = new URL(request.url).searchParams.get("id");
  if (!id) {
    try {
      id = ((await request.json()) as { id?: string })?.id ?? null;
    } catch {
      /* no body — fall through to the missing-id check */
    }
  }
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  try {
    const ok = await revokeApiKey(id);
    return Response.json({ revoked: ok });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to revoke key" },
      { status: 500 },
    );
  }
}
