/**
 * The ONE client-side error extractor for our REST routes: every API responds
 * `{ error: string }` on failure, so admin components show that message (or a
 * bare `HTTP <status>` for a non-JSON body). Browser-only (Response).
 */
export async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`;
}
