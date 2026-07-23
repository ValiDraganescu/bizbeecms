"use client";

/**
 * public-guest-chatbots Slice 7 — shared shapes + sub-panels for the ChatAgents
 * admin UI, split out of `chat-agents-manager.tsx` to keep either file well under
 * the size ceiling. Holds the client-side wire types (matching the REST
 * serializer), the design-system class tokens, the limits fields (via the shared
 * `NumberInput`), the data-source + collection allowlist row editors (fed by the
 * existing sources/requests/collections endpoints), and the last-7-days usage
 * panel. Copy is hardcoded English (this minimal surface predates a key set).
 */

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/content/confirm-modal";
import { NumberInput } from "@/components/ui/number-input";
import {
  DEFAULT_LIMITS,
  LIMIT_CEILINGS,
  formatUsdFromNano,
  type ChatAgentLimits,
  type CollectionAllowEntry,
  type DataSourceAllowEntry,
} from "@/lib/public-chat/core";

/* ---------------------------------------------------------------- wire types */

/** An agent as returned by GET /api/chat-agents (config already parsed). */
export type Agent = {
  id: string;
  name: string;
  enabled: boolean;
  model: string | null;
  welcomeMessage: string | null;
  systemPrompt: string;
  limits: ChatAgentLimits;
  dataSources: DataSourceAllowEntry[];
  collections: CollectionAllowEntry[];
  createdAt: string;
  updatedAt: string;
};

/** A data source (GET /api/data-sources). */
export type Source = { id: string; name: string };
/** A saved request under a source (GET /api/data-sources/:id/requests). */
export type SavedRequest = { id: string; name: string };
/** A collection (GET /api/collections). */
export type Collection = { name: string; tableName: string };

export type UsageRow = {
  day: string;
  messages: number;
  tokens: number;
  /**
   * BILLABLE cost in integer nano-USD — what this agent's traffic charges the
   * Site against its monthly quota (provider cost × the alias margin), not a
   * token×price estimate (ai-cost-quotas). 0 also for days recorded before cost
   * tracking existed, and for turns where the provider reported no cost.
   */
  costNanoUsd: number;
};

/** A conversation summary row (GET …/conversations — no heavy payload). */
export type ConversationSummary = {
  id: string;
  messageCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------- class tokens */

export const inputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground";
export const labelCls = "text-sm font-medium text-foreground";
export const helpCls = "text-xs text-foreground-muted";
export const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50";
export const ghostBtn =
  "rounded-md border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-40";
export const dangerBtn =
  "rounded-md border border-border px-3 py-1.5 text-sm text-danger disabled:opacity-40";

export async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; errors?: string[] };
    if (j.errors && j.errors.length > 0) return j.errors.join("; ");
    if (j.error) return j.error;
  } catch {
    /* non-JSON */
  }
  return `HTTP ${res.status}`;
}

/* --------------------------------------------------------------- limits form */

/** Human labels for the seven limit knobs, in a stable display order. */
const LIMIT_LABELS: Array<{ key: keyof ChatAgentLimits; label: string }> = [
  { key: "perIpPerMinute", label: "Messages per IP / minute" },
  { key: "perIpPerDay", label: "Messages per IP / day" },
  { key: "siteMessagesPerDay", label: "Site messages / day" },
  { key: "maxMessagesPerConversation", label: "Messages per conversation" },
  { key: "maxUserMessageLen", label: "Max user message length" },
  { key: "maxToolRounds", label: "Max tool rounds" },
  { key: "maxTokensPerResponse", label: "Max tokens per response" },
];

/**
 * The seven numeric limits. Each field is EMPTY when the value equals its default
 * (the default shows as the placeholder), so operators only see the knobs they
 * actually moved; helper text names the ceiling. Uses the shared `NumberInput`
 * (never a hand-rolled number input — CLAUDE.md rule).
 */
export function LimitsFields({
  limits,
  onChange,
}: {
  limits: Partial<ChatAgentLimits>;
  onChange: (next: Partial<ChatAgentLimits>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={labelCls}>Usage limits</legend>
      <p className={helpCls}>
        Leave a field blank to use its default. Values are clamped to safe
        ceilings server-side.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {LIMIT_LABELS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className={labelCls}>{label}</span>
            <NumberInput
              value={limits[key]}
              min={1}
              max={LIMIT_CEILINGS[key]}
              step={1}
              placeholder={`default ${DEFAULT_LIMITS[key]}`}
              ariaLabel={label}
              className={inputCls}
              onValue={(v) => {
                const next = { ...limits };
                if (v === undefined) delete next[key];
                else next[key] = Math.floor(v);
                onChange(next);
              }}
            />
            <span className={helpCls}>
              {key === "maxTokensPerResponse"
                ? `max ${LIMIT_CEILINGS[key]} — also capped by the selected model's own output limit`
                : `max ${LIMIT_CEILINGS[key]}`}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------ data-source allowlist */

/**
 * Data-source allowlist rows. Each row picks a source, then one of its saved
 * requests (loaded lazily per source), plus a tool name, description, and an
 * optional per-conversation call cap. Sources are passed in; saved requests are
 * fetched here keyed by the selected source.
 */
export function DataSourceRows({
  entries,
  sources,
  onChange,
}: {
  entries: DataSourceAllowEntry[];
  sources: Source[];
  onChange: (next: DataSourceAllowEntry[]) => void;
}) {
  const [requestsBySource, setRequestsBySource] = useState<
    Record<string, SavedRequest[]>
  >({});

  // Lazily load saved requests for every source referenced by a row.
  useEffect(() => {
    const needed = new Set(entries.map((e) => e.sourceId).filter(Boolean));
    for (const sourceId of needed) {
      if (requestsBySource[sourceId]) continue;
      void (async () => {
        try {
          const res = await fetch(`/api/data-sources/${sourceId}/requests`);
          if (!res.ok) return;
          const reqs = (await res.json()) as SavedRequest[];
          setRequestsBySource((cur) => ({ ...cur, [sourceId]: reqs }));
        } catch {
          /* offline — leave the request picker empty */
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function patch(i: number, p: Partial<DataSourceAllowEntry>) {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={labelCls}>Data-source tools</legend>
      <p className={helpCls}>
        Each row exposes one saved request as a guest tool the bot may call.
      </p>
      {entries.map((entry, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Source</span>
              <select
                className={inputCls}
                value={entry.sourceId}
                onChange={(e) =>
                  patch(i, { sourceId: e.target.value, requestId: "" })
                }
              >
                <option value="">Select a source…</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Saved request</span>
              <select
                className={inputCls}
                value={entry.requestId}
                disabled={!entry.sourceId}
                onChange={(e) => patch(i, { requestId: e.target.value })}
              >
                <option value="">Select a request…</option>
                {(requestsBySource[entry.sourceId] ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Tool name</span>
            <input
              className={inputCls}
              value={entry.toolName}
              maxLength={100}
              placeholder="check_availability"
              onChange={(e) => patch(i, { toolName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <input
              className={inputCls}
              value={entry.description}
              maxLength={500}
              placeholder="Tells the bot what this tool does"
              onChange={(e) => patch(i, { description: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Max calls per conversation (optional)</span>
            <NumberInput
              value={entry.maxCallsPerConversation}
              min={1}
              step={1}
              placeholder="unlimited"
              ariaLabel="Max calls per conversation"
              className={inputCls + " w-40"}
              onValue={(v) =>
                patch(i, {
                  maxCallsPerConversation:
                    v === undefined ? undefined : Math.floor(v),
                })
              }
            />
          </label>
          <div>
            <button
              type="button"
              className={dangerBtn}
              onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
            >
              Remove tool
            </button>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className={ghostBtn}
          onClick={() =>
            onChange([
              ...entries,
              { sourceId: "", requestId: "", toolName: "", description: "" },
            ])
          }
        >
          Add data-source tool
        </button>
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------- collection allowlist */

/**
 * Collection allowlist rows. Each row picks a collection, a description, the
 * query/create/update permissions, and — only when update is enabled — the
 * exact-match lookup fields that scope an update to one item.
 */
export function CollectionRows({
  entries,
  collections,
  onChange,
}: {
  entries: CollectionAllowEntry[];
  collections: Collection[];
  onChange: (next: CollectionAllowEntry[]) => void;
}) {
  function patch(i: number, p: Partial<CollectionAllowEntry>) {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={labelCls}>Collection tools</legend>
      <p className={helpCls}>
        Grant the bot scoped access to a collection. Updates require exact-match
        lookup fields so they only ever touch one item.
      </p>
      {entries.map((entry, i) => {
        const lookupFields = entry.lookupFields ?? [];
        return (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3"
          >
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Collection</span>
              <select
                className={inputCls}
                value={entry.collection}
                onChange={(e) => patch(i, { collection: e.target.value })}
              >
                <option value="">Select a collection…</option>
                {collections.map((c) => (
                  <option key={c.tableName} value={c.tableName}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Description</span>
              <input
                className={inputCls}
                value={entry.description}
                maxLength={500}
                placeholder="Tells the bot what this collection holds"
                onChange={(e) => patch(i, { description: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={entry.canQuery}
                  onChange={(e) => patch(i, { canQuery: e.target.checked })}
                />
                Can query
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={entry.canCreate}
                  onChange={(e) => patch(i, { canCreate: e.target.checked })}
                />
                Can create
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={entry.canUpdate}
                  onChange={(e) => patch(i, { canUpdate: e.target.checked })}
                />
                Can update
              </label>
            </div>
            {entry.canUpdate && (
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Lookup fields</span>
                <input
                  className={inputCls + " font-mono"}
                  value={lookupFields.join(", ")}
                  placeholder="email, booking_ref"
                  onChange={(e) =>
                    patch(i, {
                      lookupFields: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter((s) => s !== ""),
                    })
                  }
                />
                <span className={helpCls}>
                  Comma-separated. An update must match exactly one item on these
                  fields, or it is refused.
                </span>
              </label>
            )}
            <div>
              <button
                type="button"
                className={dangerBtn}
                onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
              >
                Remove collection
              </button>
            </div>
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className={ghostBtn}
          onClick={() =>
            onChange([
              ...entries,
              {
                collection: "",
                description: "",
                canQuery: true,
                canCreate: false,
                canUpdate: false,
                lookupFields: [],
              },
            ])
          }
        >
          Add collection tool
        </button>
      </div>
    </fieldset>
  );
}

/* ----------------------------------------------------------------- usage panel */

/** Today's message count for a list row, from GET …/usage?days=1. */
export function TodayMessages({ agentId }: { agentId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/chat-agents/${agentId}/usage?days=1`);
        if (!res.ok) return;
        const j = (await res.json()) as { usage: UsageRow[] };
        if (!cancelled) setCount(j.usage[0]?.messages ?? 0);
      } catch {
        /* offline — leave blank */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (count === null) return null;
  return <span className={helpCls}>{count} today</span>;
}

/**
 * Last-N-days messages/tokens/BILLABLE cost from GET <api>/usage?days=7. The
 * Cost column is customer dollars — the same figure this traffic burns from the
 * Site's monthly AI quota. `api` is the endpoint base: an agent passes
 * `/api/chat-agents/<id>`, the CMS assistant passes `/api/chat` (same wire
 * contract on both).
 */
export function UsagePanel({ api }: { api: string }) {
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${api}/usage?days=7`);
        if (!res.ok) throw new Error(await readError(res));
        const j = (await res.json()) as { usage: UsageRow[] };
        if (!cancelled) setUsage(j.usage);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  if (!usage)
    return (
      <p role="status" className={helpCls}>
        Loading usage…
      </p>
    );

  const totalMessages = usage.reduce((n, r) => n + r.messages, 0);
  const totalTokens = usage.reduce((n, r) => n + r.tokens, 0);
  const totalCostNano = usage.reduce((n, r) => n + (r.costNanoUsd ?? 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <p className={labelCls}>Last 7 days</p>
      <p className={helpCls}>
        {totalMessages} messages · {totalTokens} tokens ·{" "}
        {formatUsdFromNano(totalCostNano)}
      </p>
      <table className="text-sm text-foreground">
        <thead>
          <tr className="text-left text-foreground-muted">
            <th className="pr-4 font-medium">Day</th>
            <th className="pr-4 font-medium">Messages</th>
            <th className="pr-4 font-medium">Tokens</th>
            <th className="font-medium" title="Charged against this Site's monthly AI quota">
              Billable cost
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.map((r) => (
            <tr key={r.day}>
              <td className="pr-4 tabular-nums">{r.day}</td>
              <td className="pr-4 tabular-nums">{r.messages}</td>
              <td className="pr-4 tabular-nums">{r.tokens}</td>
              <td className="tabular-nums">{formatUsdFromNano(r.costNanoUsd ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- conversations panel */

const PAGE_SIZE = 25;

/** Compact local date-time for a conversation timestamp (falls back to raw ISO). */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * Recent conversations (GET <api>/conversations, paginated by limit/offset +
 * total). Each row shows started / last-activity / message count / tokens /
 * timezone, a Download link (plain <a> to the download route — no fetch), and a
 * Delete guarded by the shared ConfirmModal. Prev/next paging over `total`.
 * `api` is the endpoint base: an agent passes `/api/chat-agents/<id>`, the CMS
 * assistant passes `/api/chat` (same wire contract on both).
 */
export function ConversationsPanel({ api }: { api: string }) {
  const [rows, setRows] = useState<ConversationSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch(
        `${api}/conversations?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) throw new Error(await readError(res));
      const j = (await res.json()) as {
        conversations: ConversationSummary[];
        total: number;
      };
      setRows(j.conversations);
      setTotal(j.total);
    } catch (err) {
      setError((err as Error).message);
      setRows([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, offset]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${api}/conversations/${deleting.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res));
      setDeleting(null);
      // Deleting the last row of the final page steps back a page.
      if (rows && rows.length === 1 && offset > 0) setOffset((o) => o - PAGE_SIZE);
      else await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  if (!rows)
    return (
      <p role="status" className={helpCls}>
        Loading conversations…
      </p>
    );

  const from = total === 0 ? 0 : offset + 1;
  const to = offset + rows.length;

  return (
    <div className="flex flex-col gap-2">
      <p className={labelCls}>Conversations</p>
      {rows.length === 0 ? (
        <p className={helpCls}>No guest conversations recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-foreground">
              <thead>
                <tr className="text-left text-foreground-muted">
                  <th className="pr-4 font-medium">Started</th>
                  <th className="pr-4 font-medium">Last activity</th>
                  <th className="pr-4 font-medium">Messages</th>
                  <th className="pr-4 font-medium">Tokens</th>
                  <th className="pr-4 font-medium">Timezone</th>
                  <th className="font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1 pr-4 whitespace-nowrap">{fmtWhen(c.createdAt)}</td>
                    <td className="py-1 pr-4 whitespace-nowrap">{fmtWhen(c.updatedAt)}</td>
                    <td className="py-1 pr-4 tabular-nums">{c.messageCount}</td>
                    <td className="py-1 pr-4 tabular-nums">
                      {(c.promptTokens ?? 0) + (c.completionTokens ?? 0)}
                    </td>
                    <td className="py-1 pr-4 whitespace-nowrap">{c.timezone ?? "—"}</td>
                    <td className="py-1">
                      <div className="flex gap-2">
                        <a className={ghostBtn} href={`${api}/conversations/${c.id}`}>
                          Download
                        </a>
                        <button
                          type="button"
                          className={dangerBtn}
                          aria-label={`Delete conversation ${c.id}`}
                          onClick={() => setDeleting(c)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={helpCls}>
              {from}–{to} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={ghostBtn}
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(o - PAGE_SIZE, 0))}
              >
                Previous
              </button>
              <button
                type="button"
                className={ghostBtn}
                disabled={to >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {deleting && (
        <ConfirmModal
          message="Delete this conversation? The stored transcript will be permanently removed."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
