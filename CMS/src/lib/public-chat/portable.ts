/**
 * chat-agent-export-import — the portable `bizbeecms.agents` bundle (PURE).
 *
 * Dep-free (relative imports only) so it runs under `node --test`, mirroring
 * `lib/components/portable.ts` for components:
 *
 *  - `buildAgentsBundle` — export side: wrap already-parsed agent configs in the
 *    v1 envelope. Carries name, systemPrompt, model, enabled, welcomeMessage,
 *    limits, dataSources, collections — NEVER ids, timestamps, conversations,
 *    or usage.
 *  - `parsePortableAgent` — ONE agent-entry validator, shared verbatim with the
 *    admin create/update path (`buildAgentInput` in the chat-agents route wraps
 *    it), so the import trust boundary and the CRUD routes cannot drift. It
 *    delegates config/welcome checks to the strict core validators.
 *  - `parseAgentsBundle` — import side trust boundary: a bad ENVELOPE fails the
 *    whole file; a bad ENTRY is collected (with its index + name + the exact bad
 *    fields) and SKIPPED while its siblings import (per-agent tolerance).
 *  - `vetAgentDeps` — drop allowlist entries whose referenced collection /
 *    data-source request doesn't exist on the target site, naming exactly what
 *    was dropped (user decision: drop + warn, never block the import).
 *  - `allocateCopyName` — `name` → `name-2` → `name-3` … against the taken set
 *    (user decision: import as copy; existing agents are never modified).
 */
import {
  validateAgentConfigInput,
  validateWelcomeMessage,
  type ChatAgentLimits,
  type CollectionAllowEntry,
  type DataSourceAllowEntry,
} from "./core.ts";

export const AGENTS_FORMAT = "bizbeecms.agents";
export const AGENTS_VERSION = 1 as const;

/** One agent as it travels in a bundle — config parsed, no id/timestamps. */
export interface PortableAgent {
  name: string;
  systemPrompt: string;
  model: string | null;
  enabled: boolean;
  /** STORED string form: a plain greeting or a JSON locale object; null = none. */
  welcomeMessage: string | null;
  limits: ChatAgentLimits;
  dataSources: DataSourceAllowEntry[];
  collections: CollectionAllowEntry[];
}

export interface AgentsBundle {
  format: typeof AGENTS_FORMAT;
  version: typeof AGENTS_VERSION;
  meta?: { exportedAt?: string };
  agents: PortableAgent[];
}

/** Build the export envelope from already-parsed agents. PURE. */
export function buildAgentsBundle(
  agents: PortableAgent[],
  exportedAt?: string,
): AgentsBundle {
  return {
    format: AGENTS_FORMAT,
    version: AGENTS_VERSION,
    ...(exportedAt ? { meta: { exportedAt } } : {}),
    agents,
  };
}

/**
 * Validate + normalize ONE agent entry (create/update body or bundle entry).
 * THE shared validation path: the admin CRUD routes wrap this (`buildAgentInput`)
 * and the import boundary calls it per entry — config goes through the strict
 * core validators (`validateAgentConfigInput` / `validateWelcomeMessage`), so
 * every failure names the exact bad field and the fix. `model` is kept as-is
 * (resolved against the catalog at runtime); `enabled` defaults to true unless
 * explicitly false.
 */
export function parsePortableAgent(
  raw: unknown,
): { ok: true; agent: PortableAgent } | { ok: false; errors: string[] } {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const systemPrompt =
    typeof obj.systemPrompt === "string" ? obj.systemPrompt.trim() : "";
  const errors: string[] = [];
  if (name === "") errors.push("name is required");
  if (systemPrompt === "") errors.push("systemPrompt is required");

  const checked = validateAgentConfigInput({
    limits: obj.limits,
    dataSources: obj.dataSources,
    collections: obj.collections,
  });
  if (!checked.ok) errors.push(...checked.errors);
  const welcome = validateWelcomeMessage(obj.welcomeMessage);
  if (!welcome.ok) errors.push(welcome.error);
  if (errors.length > 0 || !checked.ok || !welcome.ok) return { ok: false, errors };

  const model =
    typeof obj.model === "string" && obj.model.trim() !== "" ? obj.model.trim() : null;

  return {
    ok: true,
    agent: {
      name,
      systemPrompt,
      model,
      enabled: obj.enabled !== false,
      welcomeMessage: welcome.value,
      limits: checked.value.limits,
      dataSources: checked.value.dataSources,
      collections: checked.value.collections,
    },
  };
}

/**
 * Parse an UNTRUSTED `bizbeecms.agents` bundle. PURE — never throws.
 *
 * A malformed ENVELOPE (bad JSON, wrong format/version, `agents` not an array)
 * fails the whole file (`ok: false`). Each ENTRY then runs through
 * `parsePortableAgent`; a bad entry is recorded in `failed` (index, best-effort
 * name, the exact field errors) and skipped — valid siblings still import.
 */
export function parseAgentsBundle(
  raw: unknown,
):
  | { ok: true; agents: PortableAgent[]; failed: { name: string; errors: string[] }[] }
  | { ok: false; errors: string[] } {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ["the file is not valid JSON"] };
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return {
      ok: false,
      errors: [`the file must be a JSON object with format "${AGENTS_FORMAT}"`],
    };
  }
  const b = obj as Record<string, unknown>;

  const envErrors: string[] = [];
  if (b.format !== AGENTS_FORMAT) {
    envErrors.push(`format must be "${AGENTS_FORMAT}", got ${JSON.stringify(b.format)}`);
  }
  if (b.version !== AGENTS_VERSION) {
    envErrors.push(
      `unsupported version (expected ${AGENTS_VERSION}, got ${String(b.version)})`,
    );
  }
  if (!Array.isArray(b.agents)) envErrors.push("agents must be an array");
  if (envErrors.length > 0) return { ok: false, errors: envErrors };

  const agents: PortableAgent[] = [];
  const failed: { name: string; errors: string[] }[] = [];
  (b.agents as unknown[]).forEach((entry, i) => {
    const parsed = parsePortableAgent(entry);
    if (parsed.ok) {
      agents.push(parsed.agent);
      return;
    }
    const rawName =
      entry && typeof entry === "object"
        ? (entry as { name?: unknown }).name
        : undefined;
    const name =
      typeof rawName === "string" && rawName.trim() !== ""
        ? rawName.trim()
        : `agent #${i + 1}`;
    failed.push({ name, errors: parsed.errors });
  });
  return { ok: true, agents, failed };
}

// ── Dependency vetting (drop + warn) ─────────────────────────────────────────

/** What the target site actually has, for allowlist vetting. */
export interface AgentDepCatalog {
  /** `content_<slug>` table names present on the target site. */
  collections: ReadonlySet<string>;
  /** `dataSourceRequestKey(sourceId, requestId)` pairs present on the target. */
  dataSourceRequests: ReadonlySet<string>;
}

/**
 * The catalog key for one saved request under a source. "|" cannot collide:
 * real ids are `crypto.randomUUID()` (hex + dashes), so a catalog key contains
 * exactly one "|" — a crafted bundle id containing "|" can never equal one.
 */
export function dataSourceRequestKey(sourceId: string, requestId: string): string {
  return `${sourceId}|${requestId}`;
}

/**
 * Drop allowlist entries whose referenced collection / data-source request is
 * absent on the target site. Returns the vetted agent (never mutates the input)
 * plus human-readable `dropped` lines naming exactly what was removed and why.
 */
export function vetAgentDeps(
  agent: PortableAgent,
  catalog: AgentDepCatalog,
): { agent: PortableAgent; dropped: string[] } {
  const dropped: string[] = [];
  const dataSources = agent.dataSources.filter((e) => {
    if (catalog.dataSourceRequests.has(dataSourceRequestKey(e.sourceId, e.requestId))) {
      return true;
    }
    dropped.push(
      `data-source tool "${e.toolName}" — request ${e.requestId} on source ${e.sourceId} does not exist on this site`,
    );
    return false;
  });
  const collections = agent.collections.filter((e) => {
    if (catalog.collections.has(e.collection)) return true;
    dropped.push(`collection "${e.collection}" does not exist on this site`);
    return false;
  });
  if (dropped.length === 0) return { agent, dropped };
  return { agent: { ...agent, dataSources, collections }, dropped };
}

// ── Copy-name allocation (import as copy, never modify) ──────────────────────

/**
 * Allocate a free name honoring the `chat_agent_name_unique` index: the name
 * itself when free, else `name-2`, `name-3`, … The caller adds each allocated
 * name to `taken` so a multi-agent file can't collide with itself.
 */
export function allocateCopyName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Download filename: the agent's slug for a selection of 1, else "chat-agents". */
export function agentsExportFilename(names: string[]): string {
  const base = names.length === 1 ? names[0] : "chat-agents";
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "chat-agents"}.agents.json`;
}
