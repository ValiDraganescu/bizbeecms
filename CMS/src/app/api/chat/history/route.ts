/**
 * AI-assistant conversation HISTORY (Milestone 2, ai-assistant goal, Slice 4
 * sub-slice 3). Per-Site saved threads — list / open / save / delete.
 *
 *   GET    /api/chat/history          → list thread summaries (newest first)
 *   GET    /api/chat/history?id=<id>  → one thread + its transcript
 *   POST   /api/chat/history          → save (upsert) a thread; returns {id, action}
 *   DELETE /api/chat/history?id=<id>  → delete a thread
 *
 * Admin-only (it reads/writes the operator's conversations). REST-only, no
 * server actions (PM directive). The save body is UNTRUSTED → validated by the
 * pure `validateThreadInput` (bounds, drops malformed messages); the store mints
 * a fresh id when none is supplied so a new conversation gets one back.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { validateThreadInput } from "@/lib/chat/history";
import {
  listThreads,
  getThread,
  saveThread,
  deleteThread,
} from "@/db/chat-history-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const thread = await getThread(id);
      if (!thread) return Response.json({ error: "thread not found" }, { status: 404 });
      return Response.json({ thread });
    }
    return Response.json({ threads: await listThreads() });
  } catch (err) {
    return Response.json(
      { error: `failed to read history: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const valid = validateThreadInput(body);
  if (!valid.ok) return Response.json({ error: valid.error }, { status: 400 });

  try {
    const res = await saveThread(valid.input);
    return Response.json(res);
  } catch (err) {
    return Response.json(
      { error: `failed to save thread: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  try {
    await deleteThread(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: `failed to delete thread: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
