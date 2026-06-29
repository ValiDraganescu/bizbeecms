/**
 * Assemble the assistant's full system prompt for a given admin-page context
 * (ai-assistant goal, Slice 4 — shared by the chat POST route and the debug
 * endpoint, so the debug view shows EXACTLY what the model gets — no fork).
 *
 * Base prompt = Site identity + existing component names + the bounded utility
 * class vocabulary (`buildSystemPrompt`), plus the page-aware context addition
 * (`contextPrompt`). D1 reads are defensive: an unbound D1 (no Site provisioned,
 * or this offline env) falls back to empty identity / no components so the base
 * instruction still ships.
 *
 * NOT pure (it reads stores), so it can't live in tool-scopes.ts. It owns the
 * @/db + @/lib imports; the pure scoping logic stays in tool-scopes.ts.
 */
import { contextPrompt, type AdminPageContext } from "@/lib/chat/tool-scopes";
import { getSiteIdentity, getContentLocales } from "@/db/settings-store";
import { listComponents } from "@/db/component-store";
import { listCollections } from "@/db/collection-store";
import {
  buildSystemPrompt,
  type PromptComponentDef,
  type PromptCollectionDef,
} from "@/lib/settings/site-settings";
import { parsePropsSchema } from "@/lib/pages/page-blocks";
import { builtinBlockTypes } from "@/lib/chat/write-tools";

export async function assembleSystemPrompt(
  context: AdminPageContext,
): Promise<string> {
  let identity;
  let components: PromptComponentDef[] = [];
  let collections: PromptCollectionDef[] = [];
  try {
    identity = await getSiteIdentity();
  } catch {
    /* unbound D1 → no identity */
  }
  try {
    // Component DEFINITIONS (name + declared props) — not implementations. So the
    // model knows what exists + which props each takes WITHOUT calling get_component.
    components = (await listComponents()).map((c) => ({
      name: c.name,
      props: parsePropsSchema(c.propsSchema).map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required,
        translatable: p.translatable,
        description: p.description,
      })),
    }));
  } catch {
    /* unbound D1 → no components */
  }

  // Content locales (default first) so the prompt can require translatable props in
  // every language. Defensive: unbound D1 → no i18n rule (single-locale behavior).
  let locales: string[] = [];
  try {
    const cl = await getContentLocales();
    locales = [cl.default, ...cl.locales.filter((l) => l !== cl.default)];
  } catch {
    /* unbound D1 → no locales */
  }
  try {
    // Collection table names + fields so the model passes the EXACT name (the
    // common failure is guessing `restaurants` for `content_restaurants`).
    collections = (await listCollections()).map((c) => ({
      tableName: c.tableName,
      fields: c.fields.map((f) => f.name),
    }));
  } catch {
    /* unbound D1 → no collections */
  }

  return (
    buildSystemPrompt({
      identity,
      components,
      builtins: builtinBlockTypes(),
      collections,
      locales,
    }) +
    "\n\n" +
    contextPrompt(context)
  );
}
