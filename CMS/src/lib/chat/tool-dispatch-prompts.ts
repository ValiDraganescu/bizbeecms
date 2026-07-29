/**
 * System-prompt version CRUD tool handlers (split from `tool-dispatch.ts`).
 * Registered in the shared HANDLERS map in `tool-dispatch.ts`.
 *
 * Manage saved system-prompt versions (the named full prompts an operator keeps
 * to compare). Storing/editing a version NEVER changes the site's active default
 * — selecting one to actually use is the chat route's per-request override path.
 */
import {
  validateCreatePrompt,
  validateUpdatePrompt,
  coercePromptId,
} from "./prompt-tools";
import { coercePageArgs, pagedResult } from "./paging";
import {
  listPromptVersions,
  createPromptVersion,
  updatePromptVersion,
  deletePromptVersion,
} from "@/db/prompt-version-store";

export async function handleListPrompts(args: unknown): Promise<Record<string, unknown>> {
  try {
    return pagedResult("prompts", await listPromptVersions(), coercePageArgs(args));
  } catch (err) {
    return { ok: false, errors: [`failed to list prompts: ${(err as Error).message}`] };
  }
}

export async function handleCreatePrompt(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreatePrompt(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  try {
    const prompt = await createPromptVersion(valid);
    return { ok: true, action: "created", prompt };
  } catch (err) {
    return { ok: false, errors: [`failed to create prompt: ${(err as Error).message}`] };
  }
}

export async function handleUpdatePrompt(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdatePrompt(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  try {
    const prompt = await updatePromptVersion(valid.id, { label: valid.label, prompt: valid.prompt });
    if (!prompt) return { ok: false, errors: [`no prompt version with id "${valid.id}"`] };
    return { ok: true, action: "updated", prompt };
  } catch (err) {
    return { ok: false, errors: [`failed to update prompt: ${(err as Error).message}`] };
  }
}

export async function handleDeletePrompt(args: unknown): Promise<Record<string, unknown>> {
  const id = coercePromptId(args);
  if (!id) return { ok: false, errors: ["id is required"] };
  try {
    await deletePromptVersion(id);
    return { ok: true, action: "deleted", id };
  } catch (err) {
    return { ok: false, errors: [`failed to delete prompt: ${(err as Error).message}`] };
  }
}
