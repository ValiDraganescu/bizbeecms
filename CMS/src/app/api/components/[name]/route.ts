/**
 * Save ONE component's code by name (Develop workbench code editor).
 *
 *   PUT /api/components/<name>  body { html, script, css }
 *
 * The other component routes don't cover this: `POST /api/components` imports a
 * portable bundle, `PATCH` is tags-only. This is the direct "edit this component's
 * artifact" path the code editor autosaves to — the REST equivalent of the AI's
 * `update_component` tool, reusing the SAME validation gate so a hand-edit can't
 * persist a broken tree or a disallowed utility class.
 *
 * `name` comes from the path (the component to update in place); the body carries
 * the new html/script/css. `propsSchema` is optional: the code editor omits it
 * (so upsertComponent preserves the existing one), but the props sidebar sends it
 * to persist edited PLACEHOLDER defaults.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { validateComponentArtifact } from "@/lib/chat/component-tool";
import { upsertComponent } from "@/db/component-store";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { name } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as {
    html?: unknown;
    script?: unknown;
    css?: unknown;
    propsSchema?: unknown;
  };

  // Validate exactly like update_component: name from the path, code from the body.
  // propsSchema is only forwarded when present (object/JSON string) so the code
  // editor's html-only save doesn't clobber the prop declarations.
  const valid = validateComponentArtifact({
    name,
    html: typeof b.html === "string" ? b.html : "",
    script: typeof b.script === "string" ? b.script : "",
    css: typeof b.css === "string" ? b.css : "",
    ...(b.propsSchema !== undefined ? { propsSchema: b.propsSchema } : {}),
  });
  if (!valid.ok) {
    return Response.json({ error: "invalid component", errors: valid.errors }, { status: 400 });
  }

  try {
    const res = await upsertComponent(valid.artifact);
    return Response.json({ action: res.action, name: res.name });
  } catch (err) {
    return Response.json(
      { error: `failed to save: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
