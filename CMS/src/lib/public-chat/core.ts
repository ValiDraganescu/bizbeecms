/**
 * Public guest-chat (ChatAgents) — Slice 2 PURE core.
 *
 * Everything the public `/api/public-chat` route and the admin ChatAgent CRUD
 * decide that needs no I/O lives here, dep-free (no `@/`, React, D1, or CF
 * imports; only relative `.ts` imports of other pure modules), so it runs under
 * `node --test`:
 *
 *  - the agent CONFIG columns (`limits` / `dataSources` / `collections`) — a
 *    TOLERANT parser for the read path (`parseAgentConfig`: garbage degrades to
 *    defaults / empty allowlists, values clamped to sane ranges) and a STRICT
 *    validator for the admin write path (`validateAgentConfigInput`: rejects with
 *    self-correcting messages naming the exact bad field + the fix),
 *  - the TRUST-BOUNDARY transcript sanitizer (`sanitizeGuestMessages`: system
 *    roles NEVER pass, count + length capped — the operator prompt always wins),
 *  - the per-IP sliding-window rate decision (`decideChatRate`: minute + day
 *    windows over one timestamp list).
 *
 * The route/store own the effects: D1 reads, the usage counters, the OpenRouter
 * stream, the attempt recording.
 */
import { MAX_OUTPUT_CEILING } from "../chat/models.ts";
import {
  isLocaleObject,
  isValidLocaleCode,
  normalizeLocaleCode,
} from "../render/localize.ts";

// ── Config shapes ─────────────────────────────────────────────────────────────

/** Usage limits for one agent (message-count based; token cap is per-response). */
export interface ChatAgentLimits {
  perIpPerMinute: number;
  perIpPerDay: number;
  siteMessagesPerDay: number;
  maxMessagesPerConversation: number;
  maxUserMessageLen: number;
  maxToolRounds: number;
  maxTokensPerResponse: number;
}

/** One allowlisted data-source saved request the bot may call, as a guest tool. */
export interface DataSourceAllowEntry {
  sourceId: string;
  requestId: string;
  /** Operator-facing tool label; slugified into the `ds_<slug>` tool name. */
  toolName: string;
  description: string;
  /** Per-conversation call cap for this tool (enforced in the dispatcher). */
  maxCallsPerConversation?: number;
  /**
   * Request params the bot MUST pass non-empty (enforced in the dispatcher with
   * a self-correcting error; annotated in the tool schema). For params the ""
   * convention would otherwise let the bot skip — e.g. forcing a date window on
   * a search tool so an unbounded query is not an option.
   */
  requiredParams?: string[];
}

/** One allowlisted collection + the guest operations permitted against it. */
export interface CollectionAllowEntry {
  /** `content_<slug>` table name. */
  collection: string;
  description: string;
  canQuery: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  /** Exact-match fields that scope an update; update tool exists only when non-empty. */
  lookupFields?: string[];
}

export interface ChatAgentConfig {
  limits: ChatAgentLimits;
  dataSources: DataSourceAllowEntry[];
  collections: CollectionAllowEntry[];
}

// ── Defaults + clamp ceilings ─────────────────────────────────────────────────

export const DEFAULT_LIMITS: ChatAgentLimits = {
  perIpPerMinute: 10,
  perIpPerDay: 100,
  siteMessagesPerDay: 500,
  maxMessagesPerConversation: 30,
  maxUserMessageLen: 2000,
  maxToolRounds: 3,
  maxTokensPerResponse: 1000,
};

/**
 * Hard ceilings per limit — a tolerant parse CLAMPS into `[1, ceiling]`; the
 * strict validator REJECTS anything outside it. These are the only cost/abuse
 * knobs a visitor's transcript can never move, so the ceilings are the real
 * safety net (the OpenRouter key's monthly USD cap is the ultimate backstop).
 */
export const LIMIT_CEILINGS: ChatAgentLimits = {
  perIpPerMinute: 120,
  perIpPerDay: 5000,
  siteMessagesPerDay: 100_000,
  maxMessagesPerConversation: 100,
  maxUserMessageLen: 20_000,
  maxToolRounds: 5,
  // Model-based, not invented here: the shared per-turn output ceiling from
  // `lib/chat/models.ts`. The public-chat route clamps FURTHER to the selected
  // model's own output cap (`outputCapFor(contextLength)`) at request time, so
  // this ceiling only bounds what an operator may CONFIGURE.
  maxTokensPerResponse: MAX_OUTPUT_CEILING,
};

const LIMIT_KEYS = Object.keys(DEFAULT_LIMITS) as (keyof ChatAgentLimits)[];

// ── Small shared guards ───────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function parseJsonLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** Clamp a raw limit value into `[1, ceiling]`, coercing to an integer; NaN → default. */
function clampLimit(raw: unknown, key: keyof ChatAgentLimits): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  if (Number.isNaN(n)) return DEFAULT_LIMITS[key];
  return Math.min(Math.max(n, 1), LIMIT_CEILINGS[key]);
}

// ── Tolerant parse (read path) ────────────────────────────────────────────────

/** Tolerant per-entry read: drop malformed data-source entries, don't reject. */
function parseDataSourceEntries(raw: unknown): DataSourceAllowEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DataSourceAllowEntry[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (!isNonEmptyStr(rec.sourceId) || !isNonEmptyStr(rec.requestId)) continue;
    if (!isNonEmptyStr(rec.toolName) || !isNonEmptyStr(rec.description)) continue;
    const entry: DataSourceAllowEntry = {
      sourceId: rec.sourceId.trim(),
      requestId: rec.requestId.trim(),
      toolName: rec.toolName.trim(),
      description: rec.description.trim(),
    };
    if (typeof rec.maxCallsPerConversation === "number" && Number.isFinite(rec.maxCallsPerConversation)) {
      const cap = Math.floor(rec.maxCallsPerConversation);
      if (cap > 0) entry.maxCallsPerConversation = cap;
    }
    if (Array.isArray(rec.requiredParams)) {
      const required = rec.requiredParams.filter(isNonEmptyStr).map((s) => s.trim());
      if (required.length > 0) entry.requiredParams = required;
    }
    out.push(entry);
  }
  return out;
}

/** Tolerant per-entry read: drop malformed collection entries, don't reject. */
function parseCollectionEntries(raw: unknown): CollectionAllowEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CollectionAllowEntry[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (!isNonEmptyStr(rec.collection) || !isNonEmptyStr(rec.description)) continue;
    const lookupFields = Array.isArray(rec.lookupFields)
      ? rec.lookupFields.filter(isNonEmptyStr).map((s) => s.trim())
      : [];
    out.push({
      collection: rec.collection.trim(),
      description: rec.description.trim(),
      canQuery: rec.canQuery === true,
      canCreate: rec.canCreate === true,
      canUpdate: rec.canUpdate === true,
      lookupFields,
    });
  }
  return out;
}

/**
 * Parse the three JSON columns into a usable config. TOLERANT by design (read
 * path): invalid JSON / wrong shapes degrade to defaults / empty allowlists,
 * malformed entries are dropped, and every limit is clamped into `[1, ceiling]`.
 * A row written by the strict validator round-trips unchanged.
 */
export function parseAgentConfig(
  limitsJson: string,
  dataSourcesJson: string,
  collectionsJson: string,
): ChatAgentConfig {
  const rawLimits = asRecord(parseJsonLoose(limitsJson)) ?? {};
  const limits = {} as ChatAgentLimits;
  for (const key of LIMIT_KEYS) limits[key] = clampLimit(rawLimits[key], key);

  return {
    limits,
    dataSources: parseDataSourceEntries(parseJsonLoose(dataSourcesJson)),
    collections: parseCollectionEntries(parseJsonLoose(collectionsJson)),
  };
}

// ── Strict validate (admin write path) ────────────────────────────────────────

export interface AgentConfigInput {
  /** Partial limits — any omitted key falls back to its default. */
  limits?: Partial<ChatAgentLimits>;
  dataSources?: unknown;
  collections?: unknown;
}

export type ConfigValidation =
  | { ok: true; value: ChatAgentConfig }
  | { ok: false; errors: string[] };

/** Reject a limit that is present but not a positive integer within its ceiling. */
function validateLimit(raw: unknown, key: keyof ChatAgentLimits, errors: string[]): number {
  if (raw === undefined) return DEFAULT_LIMITS[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    errors.push(`limits.${key} must be a number (default ${DEFAULT_LIMITS[key]})`);
    return DEFAULT_LIMITS[key];
  }
  if (!Number.isInteger(raw)) {
    errors.push(`limits.${key} must be a whole number, got ${raw}`);
    return DEFAULT_LIMITS[key];
  }
  if (raw < 1) {
    errors.push(`limits.${key} must be at least 1, got ${raw}`);
    return DEFAULT_LIMITS[key];
  }
  if (raw > LIMIT_CEILINGS[key]) {
    errors.push(`limits.${key} must be at most ${LIMIT_CEILINGS[key]}, got ${raw}`);
    return LIMIT_CEILINGS[key];
  }
  return raw;
}

function validateDataSourceEntry(item: unknown, i: number, errors: string[]): DataSourceAllowEntry | null {
  const rec = asRecord(item);
  if (!rec) {
    errors.push(`dataSources[${i}] must be an object with sourceId, requestId, toolName, description`);
    return null;
  }
  const before = errors.length;
  if (!isNonEmptyStr(rec.sourceId)) errors.push(`dataSources[${i}].sourceId is required (the data source id)`);
  if (!isNonEmptyStr(rec.requestId)) errors.push(`dataSources[${i}].requestId is required (the saved request id)`);
  if (!isNonEmptyStr(rec.toolName)) errors.push(`dataSources[${i}].toolName is required (label for the guest tool)`);
  if (!isNonEmptyStr(rec.description)) errors.push(`dataSources[${i}].description is required (tells the bot what the tool does)`);
  if (errors.length > before) return null;

  const entry: DataSourceAllowEntry = {
    sourceId: (rec.sourceId as string).trim(),
    requestId: (rec.requestId as string).trim(),
    toolName: (rec.toolName as string).trim(),
    description: (rec.description as string).trim(),
  };
  if (rec.maxCallsPerConversation !== undefined) {
    const cap = rec.maxCallsPerConversation;
    if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1) {
      errors.push(`dataSources[${i}].maxCallsPerConversation must be a positive integer when set, got ${String(cap)}`);
      return null;
    }
    entry.maxCallsPerConversation = cap;
  }
  if (rec.requiredParams !== undefined) {
    if (!Array.isArray(rec.requiredParams) || !rec.requiredParams.every(isNonEmptyStr)) {
      errors.push(`dataSources[${i}].requiredParams must be an array of non-empty param-name strings (the request params the bot must always pass non-empty)`);
      return null;
    }
    entry.requiredParams = rec.requiredParams.map((s) => (s as string).trim());
  }
  return entry;
}

function validateCollectionEntry(item: unknown, i: number, errors: string[]): CollectionAllowEntry | null {
  const rec = asRecord(item);
  if (!rec) {
    errors.push(`collections[${i}] must be an object with collection, description and can{Query,Create,Update} flags`);
    return null;
  }
  const before = errors.length;
  if (!isNonEmptyStr(rec.collection)) errors.push(`collections[${i}].collection is required (the content_<slug> table name)`);
  if (!isNonEmptyStr(rec.description)) errors.push(`collections[${i}].description is required (tells the bot what the collection holds)`);
  for (const flag of ["canQuery", "canCreate", "canUpdate"] as const) {
    if (rec[flag] !== undefined && typeof rec[flag] !== "boolean") {
      errors.push(`collections[${i}].${flag} must be true or false, got ${String(rec[flag])}`);
    }
  }
  let lookupFields: string[] = [];
  if (rec.lookupFields !== undefined) {
    if (!Array.isArray(rec.lookupFields) || !rec.lookupFields.every(isNonEmptyStr)) {
      errors.push(`collections[${i}].lookupFields must be an array of non-empty field-name strings`);
    } else {
      lookupFields = rec.lookupFields.map((s) => (s as string).trim());
    }
  }
  const canUpdate = rec.canUpdate === true;
  if (canUpdate && lookupFields.length === 0) {
    errors.push(`collections[${i}] enables canUpdate but has no lookupFields — add at least one exact-match field so updates are scoped to one item`);
  }
  if (errors.length > before) return null;

  return {
    collection: (rec.collection as string).trim(),
    description: (rec.description as string).trim(),
    canQuery: rec.canQuery === true,
    canCreate: rec.canCreate === true,
    canUpdate,
    lookupFields,
  };
}

/**
 * STRICT validator for the admin tool / REST write path. Accepts PARTIAL limits
 * (missing keys default). Every failure is a self-correcting message naming the
 * exact bad field and the fix (project AI-error philosophy). Collects all errors
 * so one round-trip surfaces every problem.
 */
export function validateAgentConfigInput(args: unknown): ConfigValidation {
  const rec = asRecord(args);
  if (!rec) return { ok: false, errors: ["config must be an object with optional limits, dataSources, collections"] };

  const errors: string[] = [];

  const rawLimits = rec.limits === undefined ? {} : asRecord(rec.limits);
  if (rawLimits === null) {
    errors.push("limits must be an object of limit → number (omit a key to use its default)");
  }
  const limits = {} as ChatAgentLimits;
  for (const key of LIMIT_KEYS) {
    limits[key] = validateLimit(rawLimits?.[key], key, errors);
  }

  const dataSources: DataSourceAllowEntry[] = [];
  if (rec.dataSources !== undefined) {
    if (!Array.isArray(rec.dataSources)) {
      errors.push("dataSources must be an array (omit it or pass [] for none)");
    } else {
      rec.dataSources.forEach((item, i) => {
        const entry = validateDataSourceEntry(item, i, errors);
        if (entry) dataSources.push(entry);
      });
    }
  }

  const collections: CollectionAllowEntry[] = [];
  if (rec.collections !== undefined) {
    if (!Array.isArray(rec.collections)) {
      errors.push("collections must be an array (omit it or pass [] for none)");
    } else {
      rec.collections.forEach((item, i) => {
        const entry = validateCollectionEntry(item, i, errors);
        if (entry) collections.push(entry);
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { limits, dataSources, collections } };
}

// ── Localized welcome message (pure) ──────────────────────────────────────────
//
// A chat agent's `welcomeMessage` column stores either a plain string (one
// greeting for every visitor) or a JSON LOCALE OBJECT ({"en":"Hello","fi":
// "Hei"}) — the same inline localization model as block props, resolved per
// active content locale by the render walk (lib/render/localize.ts).

/**
 * Parse a STORED welcomeMessage into what the render hydration injects as the
 * GuestChat block's `welcome` prop: a JSON locale object round-trips to the
 * OBJECT (the plan walk then resolves it per locale); anything else stays the
 * plain string.
 */
export function parseStoredWelcome(stored: string): string | Record<string, string> {
  const trimmed = stored.trim();
  if (!trimmed.startsWith("{")) return stored;
  const parsed = parseJsonLoose(trimmed);
  if (isLocaleObject(parsed)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() !== "") out[normalizeLocaleCode(k)] = v;
    }
    if (Object.keys(out).length > 0) return out;
  }
  return stored;
}

/**
 * Validate an INCOMING welcomeMessage (write path — REST and MCP): a plain
 * string, or a locale object of locale code → greeting. Returns the STORED
 * string form (locale objects serialize to JSON; empty values drop; all-empty →
 * null, i.e. no welcome). Self-correcting errors name the exact bad key.
 */
export function validateWelcomeMessage(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw === "string") {
    const t = raw.trim();
    return { ok: true, value: t === "" ? null : t };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isValidLocaleCode(k)) {
        return {
          ok: false,
          error: `welcomeMessage keys must be locale codes (like "en" or "pt-br") — "${k}" is not one`,
        };
      }
      if (typeof v !== "string") {
        return { ok: false, error: `welcomeMessage.${k} must be a string` };
      }
      if (v.trim() !== "") out[normalizeLocaleCode(k)] = v.trim();
    }
    if (Object.keys(out).length === 0) return { ok: true, value: null };
    return { ok: true, value: JSON.stringify(out) };
  }
  return {
    ok: false,
    error:
      'welcomeMessage must be a string or a locale object like {"en":"Hello","fi":"Hei"}',
  };
}

// ── Guest transcript sanitizer (trust boundary) ───────────────────────────────

export type GuestMessage = { role: "user" | "assistant"; content: string; at?: string };

/** Max chars for a validated `at` timestamp (contract: ISO-8601 with offset). */
const AT_MAX_LEN = 40;

/**
 * Validate a per-message `at` timestamp against the contract: an ISO-8601 string
 * WITH an explicit offset (a trailing `Z` or `±HH:MM`), at most `AT_MAX_LEN`
 * chars, that `Date` can parse. Anything else → undefined (the message is still
 * accepted; only the timestamp is dropped). Pure — no `Date.now()`.
 */
function validateAt(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > AT_MAX_LEN) return undefined;
  // Must carry an explicit offset: trailing Z, or ±HH:MM after the time.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return undefined;
  if (Number.isNaN(Date.parse(raw))) return undefined;
  return raw;
}

export type SanitizedMessages =
  | { ok: true; messages: GuestMessage[] }
  | { ok: false; status: number; error: string };

/**
 * Sanitize the visitor's posted transcript before it reaches the model.
 *
 * TRUST BOUNDARY: `system` roles NEVER pass (the operator's prompt is prepended
 * by the route and always wins — a visitor cannot inject one); non-user/assistant
 * roles, non-string content, and empty messages are dropped silently. The
 * REMAINING messages are then capped:
 *  - a `user` message longer than `maxUserMessageLen` → 400 (malformed input),
 *  - more than `maxMessagesPerConversation` kept messages → 409 (the conversation
 *    is too long; the widget tells the visitor to start a new chat).
 */
export function sanitizeGuestMessages(
  raw: unknown,
  limits: ChatAgentLimits,
): SanitizedMessages {
  if (!Array.isArray(raw)) {
    return { ok: false, status: 400, error: "messages must be an array" };
  }
  const messages: GuestMessage[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (rec.role !== "user" && rec.role !== "assistant") continue; // system NEVER passes
    if (typeof rec.content !== "string") continue;
    const content = rec.content;
    if (content.trim() === "") continue;
    if (rec.role === "user" && content.length > limits.maxUserMessageLen) {
      return {
        ok: false,
        status: 400,
        error: `message too long — keep it under ${limits.maxUserMessageLen} characters`,
      };
    }
    const at = validateAt(rec.at);
    messages.push(at ? { role: rec.role, content, at } : { role: rec.role, content });
  }
  if (messages.length > limits.maxMessagesPerConversation) {
    return {
      ok: false,
      status: 409,
      error: `this conversation is too long (max ${limits.maxMessagesPerConversation} messages) — please start a new chat`,
    };
  }
  return { ok: true, messages };
}

// ── Per-IP rate decision (sliding minute + day windows) ───────────────────────

export const CHAT_MINUTE_MS = 60 * 1000;
export const CHAT_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decide whether this IP is rate-locked. One timestamp list (the recent chat
 * attempts for the IP) is evaluated against BOTH sliding windows: the minute
 * window locks at `perIpPerMinute`, the day window at `perIpPerDay`. Modeled on
 * `decideFormRate` (submit-core.ts) but with two windows over the same list.
 */
export function decideChatRate(
  timestamps: number[],
  limits: ChatAgentLimits,
  now: number = Date.now(),
): { locked: boolean; reason?: "minute" | "day" } {
  const inMinute = timestamps.filter((t) => t > now - CHAT_MINUTE_MS).length;
  if (inMinute >= limits.perIpPerMinute) return { locked: true, reason: "minute" };
  const inDay = timestamps.filter((t) => t > now - CHAT_DAY_MS).length;
  if (inDay >= limits.perIpPerDay) return { locked: true, reason: "day" };
  return { locked: false };
}

// ── Conversation meta + time-awareness (pure) ─────────────────────────────────

/** Client conversationId: a lowercase-or-upper hex UUID (8-4-4-4-12). */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** IANA timezone: `Area/Location` segments, letters/digits/_/+/-, up to 3 parts. */
const TZ_RE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
const TZ_MAX_LEN = 64;
/** UTC offset bounds in minutes (±14h — the widest real-world zone span). */
const OFFSET_MIN = -840;
const OFFSET_MAX = 840;

export interface ConversationMeta {
  /** A valid UUID, or "" when the body's `conversationId` is absent/invalid. */
  conversationId: string;
  /** A valid IANA timezone, or "" when absent/invalid. */
  timezone: string;
  /** Offset minutes in [-840, 840]; 0 when absent/invalid. */
  utcOffsetMinutes: number;
}

/**
 * Extract + validate the conversation meta from the request body, per the widget
 * contract. Every field degrades to a safe empty/zero value on absence or
 * violation (an invalid `conversationId` → "" makes the request anonymous:
 * still answered, never persisted). Pure — no I/O.
 */
export function parseConversationMeta(body: unknown): ConversationMeta {
  const rec = asRecord(body) ?? {};

  const rawId = rec.conversationId;
  const conversationId = typeof rawId === "string" && UUID_RE.test(rawId) ? rawId : "";

  const rawTz = rec.timezone;
  const timezone =
    typeof rawTz === "string" && rawTz.length <= TZ_MAX_LEN && TZ_RE.test(rawTz) ? rawTz : "";

  const rawOffset = rec.utcOffsetMinutes;
  const utcOffsetMinutes =
    typeof rawOffset === "number" &&
    Number.isInteger(rawOffset) &&
    rawOffset >= OFFSET_MIN &&
    rawOffset <= OFFSET_MAX
      ? rawOffset
      : 0;

  return { conversationId, timezone, utcOffsetMinutes };
}

/** Format an offset in minutes as `±HH:MM` (e.g. 180 → "+03:00", -330 → "-05:30"). */
function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Copy each message with its `content` suffixed `\n[at <at>]` when it carries a
 * valid `at`, so the model sees each turn's local timestamp. NEVER mutates the
 * originals (returns fresh objects, `at`/role preserved). The offset is accepted
 * for symmetry with the conversation context but the `at` already carries its own
 * offset, so it is not re-applied here.
 */
export function stampForModel(
  messages: GuestMessage[],
  _offsetMinutes: number,
): GuestMessage[] {
  return messages.map((m) =>
    m.at
      ? { ...m, content: `${m.content}\n[at ${m.at}]` }
      : { ...m },
  );
}

/**
 * One system-prompt line telling the model the visitor's time frame. DELIBERATELY
 * STABLE within a conversation (timezone + offset only — no wall-clock time):
 * the system prompt is the provider's cache-prefix byte 0, so anything volatile
 * here re-ingests the whole conversation every message. "Now" is instead read
 * from the newest user message's `[at …]` stamp (every user turn carries one).
 */
export function timeContextLine(
  timezone: string,
  utcOffsetMinutes: number,
): string {
  const offset = formatOffset(utcOffsetMinutes);
  const zoneLabel = timezone ? `${timezone}, UTC${offset}` : `UTC${offset}`;
  return `Visitor timezone: ${zoneLabel}. Message timestamps are in the visitor's local time; treat the newest user message's [at …] stamp as the current moment.`;
}

/**
 * Convert a local ISO-8601 time to UTC. If `localTime` carries an explicit offset
 * (trailing `Z` or `±HH:MM`) that offset is used; otherwise `fallbackOffsetMinutes`
 * (the conversation's offset) is applied. Returns a self-correcting error naming
 * the exact expected format on unparseable input. Pure — the model calls this via
 * the builtin `local_time_to_utc` tool.
 */
export function localTimeToUtc(
  localTime: unknown,
  fallbackOffsetMinutes: number,
): { ok: true; utc: string } | { ok: false; error: string } {
  if (typeof localTime !== "string" || localTime.trim() === "") {
    return {
      ok: false,
      error:
        "local_time is required — pass an ISO-8601 time like \"2026-07-22T15:48:59\" (offset optional, e.g. \"…+03:00\" or \"…Z\").",
    };
  }
  const raw = localTime.trim();
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw);
  if (hasOffset) {
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) {
      return {
        ok: false,
        error: `could not parse "${raw}" — expected ISO-8601 like "2026-07-22T15:48:59+03:00" or "2026-07-22T12:48:59Z".`,
      };
    }
    return { ok: true, utc: new Date(ms).toISOString() };
  }
  // No offset: parse the wall-clock as if it were UTC, then subtract the fallback
  // offset to recover the true UTC instant. `Date.parse` treats a bare date-time
  // (no offset) as UTC in Node/V8 ISO mode, so parsing `${raw}Z` is deterministic.
  const asUtcMs = Date.parse(raw.endsWith("Z") ? raw : `${raw}Z`);
  if (Number.isNaN(asUtcMs)) {
    return {
      ok: false,
      error: `could not parse "${raw}" — expected ISO-8601 like "2026-07-22T15:48:59" (date and time, T-separated).`,
    };
  }
  const utcMs = asUtcMs - fallbackOffsetMinutes * 60_000;
  return { ok: true, utc: new Date(utcMs).toISOString() };
}

// ── Persisted payload cap (pure) ──────────────────────────────────────────────

/** Max serialized size of the stored conversation payload (D1 row cost bound). */
export const MAX_PAYLOAD_BYTES = 512 * 1024;

/**
 * A stored conversation payload. `messages` is the verbatim gateway transcript
 * (user/assistant/tool_calls/tool entries). Kept structurally loose — the route
 * builds it from the reframe transcript; this module only caps its size.
 */
export interface ConversationPayload {
  version: number;
  system: string;
  tools: unknown[];
  model: string;
  timezone: string;
  utcOffsetMinutes: number;
  messages: unknown[];
  usage: { promptTokens: number; completionTokens: number };
  truncated?: boolean;
}

/** UTF-8 byte length of a string (payload cap is measured in bytes, not chars). */
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Rebuild the model context from the STORED gateway transcript (full fidelity —
 * assistant `tool_calls` turns and `role:"tool"` results included) plus the
 * client's NEW user turn. Without this, every request rebuilds context from the
 * widget's text-only transcript and the model loses what its tools already
 * learned (booking ids, channel policy), re-fetching it turn after turn.
 *
 * The client transcript stays the source of truth for what the visitor SAW; the
 * stored transcript must agree with it or the caller falls back to the client
 * transcript. Returns null unless:
 *  - `payloadJson` parses and its `messages` is a non-empty array,
 *  - the client's LAST message is the new `user` turn,
 *  - the stored FINAL assistant turns (role assistant, no `tool_calls`,
 *    non-empty content — one per completed request) count exactly the client's
 *    assistant turns. A desynced store (failed write, idle reset, a guessed
 *    conversationId) must never resurrect a different conversation.
 *
 * The size cap can behead the stored transcript mid-round, so leading entries
 * are dropped to the first `user` turn — the gateway never sees an orphan tool
 * result. Stored contents are already `[at …]`-stamped; only the new user turn
 * is stamped here.
 */
export function rehydrateGuestTranscript(
  payloadJson: string,
  clientMessages: GuestMessage[],
): Array<Record<string, unknown>> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  const payload = asRecord(parsed);
  const raw = payload?.messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const newTurn = clientMessages[clientMessages.length - 1];
  if (!newTurn || newTurn.role !== "user") return null;

  const entries: Record<string, unknown>[] = [];
  for (const e of raw) {
    const rec = asRecord(e);
    if (rec) entries.push(rec);
  }
  const start = entries.findIndex((e) => e.role === "user");
  if (start === -1) return null;
  const stored = entries.slice(start);

  const storedFinals = stored.filter(
    (e) =>
      e.role === "assistant" &&
      e.tool_calls === undefined &&
      typeof e.content === "string" &&
      e.content !== "",
  ).length;
  const clientAssistants = clientMessages
    .slice(0, -1)
    .filter((m) => m.role === "assistant").length;
  if (storedFinals !== clientAssistants) return null;

  const [stamped] = stampForModel([newTurn], 0);
  return [...stored, stamped as unknown as Record<string, unknown>];
}

/**
 * Cap the serialized payload at `MAX_PAYLOAD_BYTES` by dropping the OLDEST
 * messages until it fits, marking `truncated: true` when anything was dropped.
 * Returns the (possibly trimmed) payload — never mutates the input. Pure so the
 * route's fire-and-forget persist can rely on a tested bound.
 */
export function capConversationPayload(payload: ConversationPayload): ConversationPayload {
  if (byteLength(JSON.stringify(payload)) <= MAX_PAYLOAD_BYTES) return payload;

  const messages = [...payload.messages];
  let truncated = false;
  // Drop oldest messages one at a time until the whole payload fits. Even an
  // empty transcript may still exceed the cap (huge system/tools) — then we stop
  // and flag it truncated rather than loop forever.
  while (messages.length > 0) {
    truncated = true;
    messages.shift();
    if (byteLength(JSON.stringify({ ...payload, messages, truncated })) <= MAX_PAYLOAD_BYTES) {
      break;
    }
  }
  return { ...payload, messages, truncated };
}

// ── Usage cost (nano-USD counters) ────────────────────────────────────────────

/** 1 USD in the integer nano-USD unit the `:cost` usage counter accumulates. */
export const NANO_USD_PER_USD = 1_000_000_000;

/**
 * Integer nano-USD (1e-9 USD) cost of one usage event: the event's prompt /
 * completion token counts priced at the model's per-token USD catalog prices.
 * Priced at RECORD time — each turn is billed at the model actually used, so a
 * later model/price change never rewrites history. A missing/null price
 * contributes 0 (the counter under-reports rather than guessing). Integer so
 * the atomic `usage_counter` bump stays exact.
 */
export function usageCostNanoUsd(
  usage: { promptTokens?: number; completionTokens?: number },
  prices?: { inputPrice?: number | null; outputPrice?: number | null },
): number {
  const usd =
    (usage.promptTokens ?? 0) * (prices?.inputPrice ?? 0) +
    (usage.completionTokens ?? 0) * (prices?.outputPrice ?? 0);
  return Math.round(usd * NANO_USD_PER_USD);
}

/**
 * The UTC `YYYY-MM` bucket an AI call is metered into. Month rollover IS the
 * monthly reset of the `ai:<month>:*` counters — no cron, no reset job. UTC
 * everywhere so a Worker's timezone can never split one month in two.
 */
export function aiUsageMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Integer nano-USD of a provider-reported cost (`usage.cost`, USD). This is the
 * RAW number OpenRouter actually charged — billing-grade truth, unlike the
 * token×catalog estimate above. Non-positive / non-finite input (absent usage,
 * NaN from a malformed body) meters nothing rather than guessing.
 */
export function rawNanoUsd(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  return Math.round(costUsd * NANO_USD_PER_USD);
}

/**
 * Integer nano-USD CHARGED to the customer for a provider cost: raw × (1 +
 * marginPct/100), the `ai:<YYYY-MM>:billable` meter (docs/ai-cost-quotas.md).
 * A missing/invalid margin means "no margin configured" → billable == raw, so
 * an unreachable curated config can never over- or under-charge.
 */
export function billableNanoUsd(costUsd: number, marginPct: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  const pct = Number.isFinite(marginPct) && marginPct > 0 ? marginPct : 0;
  return Math.round(costUsd * (1 + pct / 100) * NANO_USD_PER_USD);
}

/**
 * Display formatter for an accumulated nano-USD count. Cents and up render as
 * "$1.23"; below a cent, four decimals so small per-day costs don't flatten to
 * $0.00; a nonzero amount below $0.0001 shows "<$0.0001"; exact zero is "$0".
 */
export function formatUsdFromNano(nanoUsd: number): string {
  if (nanoUsd === 0) return "$0";
  const usd = nanoUsd / NANO_USD_PER_USD;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return "<$0.0001";
}
