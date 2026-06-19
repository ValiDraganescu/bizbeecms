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
import { getSiteIdentity } from "@/db/settings-store";
import { listComponentNames } from "@/db/component-store";
import { buildSystemPrompt } from "@/lib/settings/site-settings";
import { allowedClasses } from "@/lib/render/utility-css";

export async function assembleSystemPrompt(
  context: AdminPageContext,
): Promise<string> {
  let identity;
  let componentNames: string[] = [];
  try {
    identity = await getSiteIdentity();
  } catch {
    /* unbound D1 → no identity */
  }
  try {
    componentNames = await listComponentNames();
  } catch {
    /* unbound D1 → no components */
  }

  return (
    buildSystemPrompt({
      identity,
      componentNames,
      utilityClasses: [...allowedClasses()].sort(),
    }) +
    "\n\n" +
    contextPrompt(context)
  );
}
