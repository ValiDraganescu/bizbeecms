/**
 * System-prompt versions CRUD (ai-widget-ux — PM-SSO prompt editor).
 *
 * A PM-SSO operator saves named FULL system-prompt versions to compare results.
 * Selecting one applies to the tester's SESSION ONLY (the widget sends it as a
 * per-request `systemPromptOverride` on the chat POST); this route only stores
 * the versions, it NEVER mutates any site default.
 *
 * PM-SSO operators ONLY — gated on the SERVER (`requirePmSso`, 403 for non-SSO)
 * on EVERY verb. REST-only (PM directive).
 *
 *  GET    → list saved versions (newest first)
 *  POST   → create a version from { label, prompt } (validated)
 *  DELETE → ?id=<id> removes one
 */
import { requirePmSso } from "@/lib/auth/guard";
import { validatePromptInput } from "@/lib/chat/prompt-version";
import {
  listPromptVersions,
  createPromptVersion,
  deletePromptVersion,
} from "@/db/prompt-version-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePmSso(request);
  if (denied) return denied;
  try {
    const versions = await listPromptVersions();
    return Response.json({ versions });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requirePmSso(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = validatePromptInput(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const version = await createPromptVersion(parsed);
    return Response.json({ version }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requirePmSso(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  try {
    await deletePromptVersion(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
