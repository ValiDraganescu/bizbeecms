"use client";

/**
 * external-data-sources Slice 4 — the central Data Sources management UI.
 *
 * Sources: list / add / edit / delete (in-app ConfirmModal, NEVER native
 * confirm). The secret is WRITE-ONLY: never echoed back (`hasSecret` badge,
 * blank field = keep on edit). Each source expands to its SAVED REQUESTS:
 * method GET/POST/PUT/DELETE, path/query/body templates with `{placeholders}`,
 * per-request cache on/off + TTL, and the `retryable` flag (labeled "safe to
 * retry/cache" — it gates BOTH, see goal caveat). A Test panel renders one
 * input per placeholder and runs the live call via the test endpoint so the
 * operator can see the response shape to build dot-path maps.
 *
 * REST-only (no server actions), next-intl EN/FI/ET, purpose-token Tailwind.
 * Server validation (lib/data-sources/validate.ts) is the source of truth —
 * the client just disables incomplete forms and surfaces server errors.
 *
 * ponytail: client fetch + local state, no data lib; query params edit as
 * key=value lines in a textarea, structured rows if operators trip on it.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import {
  AUTH_TYPES,
  HTTP_METHODS,
  DEFAULT_CACHE_TTL_SEC,
  requestPlaceholders,
  type AuthType,
  type HttpMethod,
} from "@/lib/data-sources/validate";
import { parseQueryLines, serializeQuery } from "@/lib/data-sources/query-lines";

type Source = {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  authParam: string | null;
  hasSecret: boolean;
};

type SavedRequest = {
  id: string;
  sourceId: string;
  name: string;
  method: string;
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
};

type TestResult =
  | { ok: true; status: number; data: unknown; cached: boolean }
  | { ok: false; status: number | null; error: string };

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON */
  }
  return `HTTP ${res.status}`;
}

const inputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground";
const labelCls = "text-sm font-medium text-foreground";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50";
const ghostBtn =
  "rounded-md border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-40";
const dangerBtn =
  "rounded-md border border-border px-3 py-1.5 text-sm text-danger disabled:opacity-40";

export function DataSourcesManager() {
  const t = useTranslations("dataSources");
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [purgedAll, setPurgedAll] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/data-sources");
      if (!res.ok) throw new Error(await readError(res));
      setSources((await res.json()) as Source[]);
    } catch (err) {
      setError((err as Error).message);
      setSources([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/data-sources/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setDeleting(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Global purge = bump the global cache-version counter (in-app confirm —
  // it invalidates EVERY cached API response, so it gets the modal).
  async function confirmPurgeAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/data-sources/purge", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      setPurgeAllOpen(false);
      setPurgedAll(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sources === null)
    return (
      <p role="status" className="text-foreground-muted">
        {t("loading")}
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {sources.length === 0 && !adding && (
        <p className="text-foreground-muted">{t("empty")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {sources.map((source) => (
          <li
            key={source.id}
            className="rounded-lg border border-border bg-surface-raised p-4"
          >
            {editingId === source.id ? (
              <SourceForm
                source={source}
                onDone={async () => {
                  setEditingId(null);
                  await load();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{source.name}</p>
                    <p className="truncate font-mono text-sm text-foreground-muted">
                      {source.baseUrl}
                    </p>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {t(`authTypes.${source.authType}`)}
                      {source.authParam ? ` · ${source.authParam}` : ""}
                      {" · "}
                      <span className={source.hasSecret ? "text-success" : ""}>
                        {source.hasSecret ? t("secretSet") : t("noSecret")}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={ghostBtn}
                      aria-expanded={expandedId === source.id}
                      aria-controls={`ds-requests-${source.id}`}
                      aria-label={`${t("requests")} — ${source.name}`}
                      onClick={() =>
                        setExpandedId(expandedId === source.id ? null : source.id)
                      }
                    >
                      {t("requests")}
                    </button>
                    <button
                      type="button"
                      className={ghostBtn}
                      aria-label={`${t("edit")} — ${source.name}`}
                      onClick={() => setEditingId(source.id)}
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      className={dangerBtn}
                      aria-label={`${t("delete")} — ${source.name}`}
                      onClick={() => setDeleting(source)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
                {expandedId === source.id && <RequestsPanel sourceId={source.id} />}
              </>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <SourceForm
            onDone={async () => {
              setAdding(false);
              await load();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
            {t("addSource")}
          </button>
          {sources.length > 0 && (
            <button
              type="button"
              className={dangerBtn}
              disabled={busy}
              onClick={() => {
                setPurgedAll(false);
                setPurgeAllOpen(true);
              }}
            >
              {t("purgeAll")}
            </button>
          )}
          {/* Persistent live region so the purge confirmation is announced. */}
          <span role="status" className="text-sm text-success">
            {purgedAll ? t("purged") : ""}
          </span>
        </div>
      )}

      {purgeAllOpen && (
        <ConfirmModal
          message={t("purgeAllConfirm")}
          confirmLabel={t("purgeAllAction")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmPurgeAll()}
          onCancel={() => setPurgeAllOpen(false)}
        />
      )}

      {deleting && (
        <ConfirmModal
          message={t("deleteSourceConfirm", { name: deleting.name })}
          confirmLabel={t("delete")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ source form */

function SourceForm({
  source,
  onDone,
  onCancel,
}: {
  source?: Source;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const t = useTranslations("dataSources");
  const [name, setName] = useState(source?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(source?.baseUrl ?? "");
  const [authType, setAuthType] = useState<AuthType>((source?.authType as AuthType) ?? "header");
  const [authParam, setAuthParam] = useState(source?.authParam ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // oauth2 rides its TOKEN URL in authParam (secret = "client_id:client_secret").
  const needsParam = authType === "header" || authType === "query" || authType === "oauth2";
  const needsSecret = authType !== "none";
  // A new source with auth needs a secret NOW; on edit, blank = keep the stored one.
  const canSave =
    name.trim() !== "" &&
    baseUrl.trim() !== "" &&
    (!needsParam || authParam.trim() !== "") &&
    (!needsSecret || secret.trim() !== "" || source?.hasSecret === true) &&
    !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        authType,
        authParam: needsParam ? authParam.trim() : null,
      };
      // Write-only secret: include only when set (create/replace); switching to
      // "none" clears the stored secret explicitly.
      if (secret.trim() !== "") payload.secret = secret.trim();
      else if (source && authType === "none" && source.hasSecret) payload.secret = "";

      const res = await fetch(source ? `/api/data-sources/${source.id}` : "/api/data-sources", {
        method: source ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res));
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-medium text-foreground">
        {source ? t("editSource") : t("addSource")}
      </h2>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("name")}</span>
        <input
          className={inputCls}
          value={name}
          maxLength={100}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("baseUrl")}</span>
        <input
          className={inputCls + " font-mono"}
          placeholder="https://api.example.com/v1"
          value={baseUrl}
          maxLength={2000}
          required
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("authType")}</span>
          <select
            className={inputCls}
            value={authType}
            onChange={(e) => setAuthType(e.target.value as AuthType)}
          >
            {AUTH_TYPES.map((a) => (
              <option key={a} value={a}>
                {t(`authTypes.${a}`)}
              </option>
            ))}
          </select>
        </label>
        {needsParam && (
          <label className="flex flex-col gap-1">
            <span className={labelCls}>
              {authType === "header"
                ? t("authParamHeader")
                : authType === "query"
                  ? t("authParamQuery")
                  : t("authParamTokenUrl")}
            </span>
            <input
              className={inputCls + " font-mono"}
              placeholder={
                authType === "header"
                  ? "X-API-Key"
                  : authType === "query"
                    ? "appid"
                    : "https://auth.example.com/oauth2/token"
              }
              value={authParam}
              maxLength={authType === "oauth2" ? 2000 : 100}
              required
              onChange={(e) => setAuthParam(e.target.value)}
            />
          </label>
        )}
      </div>
      {needsSecret && (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("secret")}</span>
          <input
            type="password"
            autoComplete="new-password"
            className={inputCls + " font-mono"}
            placeholder={
              source?.hasSecret
                ? t("secretKeptPlaceholder")
                : authType === "oauth2"
                  ? "client_id:client_secret"
                  : authType === "basic"
                    ? "user:password"
                    : t("secretPlaceholder")
            }
            value={secret}
            maxLength={2000}
            // On edit, blank = keep the stored secret — only a NEW source requires one.
            required={source?.hasSecret !== true}
            onChange={(e) => setSecret(e.target.value)}
          />
          <span className="text-xs text-foreground-muted">{t("secretHelp")}</span>
        </label>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn} disabled={!canSave}>
          {busy ? t("saving") : t("save")}
        </button>
        <button type="button" className={ghostBtn} disabled={busy} onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------- requests panel */

function RequestsPanel({ sourceId }: { sourceId: string }) {
  const t = useTranslations("dataSources");
  const [requests, setRequests] = useState<SavedRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedRequest | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [purgedId, setPurgedId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/data-sources/${sourceId}/requests`);
      if (!res.ok) throw new Error(await readError(res));
      setRequests((await res.json()) as SavedRequest[]);
    } catch (err) {
      setError((err as Error).message);
      setRequests([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/data-sources/${sourceId}/requests/${deleting.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res));
      setDeleting(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Per-request purge = bump that request's cache-version counter.
  async function purge(req: SavedRequest) {
    setError(null);
    setPurgedId(null);
    try {
      const res = await fetch(`/api/data-sources/${sourceId}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setPurgedId(req.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div
      id={`ds-requests-${sourceId}`}
      className="mt-4 flex flex-col gap-3 border-t border-border pt-4"
    >
      <h3 className="text-sm font-medium text-foreground">{t("requestsTitle")}</h3>
      {requests === null ? (
        <p role="status" className="text-sm text-foreground-muted">
          {t("loading")}
        </p>
      ) : (
        <>
          {requests.length === 0 && !adding && (
            <p className="text-sm text-foreground-muted">{t("noRequests")}</p>
          )}
          <ul className="flex flex-col gap-2">
            {requests.map((req) =>
              editingId === req.id ? (
                <li key={req.id} className="rounded-md border border-border bg-surface p-3">
                  <RequestForm
                    sourceId={sourceId}
                    request={req}
                    onDone={async () => {
                      setEditingId(null);
                      await load();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={req.id} className="rounded-md border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{req.name}</p>
                      <p className="truncate font-mono text-xs text-foreground-muted">
                        {req.method} {req.path || "/"}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {req.cacheEnabled
                          ? t("cacheSummary", { ttl: req.cacheTtlSec })
                          : t("cacheOff")}
                        {req.retryable ? ` · ${t("retryableBadge")}` : ""}
                        {/* role=status so the purge confirmation is announced. */}
                        <span role="status" className="text-success">
                          {purgedId === req.id ? ` · ${t("purged")}` : ""}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {req.cacheEnabled && (
                        <button
                          type="button"
                          className={ghostBtn}
                          aria-label={`${t("purge")} — ${req.name}`}
                          onClick={() => void purge(req)}
                        >
                          {t("purge")}
                        </button>
                      )}
                      <button
                        type="button"
                        className={ghostBtn}
                        aria-expanded={testingId === req.id}
                        aria-controls={`ds-test-${req.id}`}
                        aria-label={`${t("test")} — ${req.name}`}
                        onClick={() => setTestingId(testingId === req.id ? null : req.id)}
                      >
                        {t("test")}
                      </button>
                      <button
                        type="button"
                        className={ghostBtn}
                        aria-label={`${t("edit")} — ${req.name}`}
                        onClick={() => setEditingId(req.id)}
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        className={dangerBtn}
                        aria-label={`${t("delete")} — ${req.name}`}
                        onClick={() => setDeleting(req)}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </div>
                  {testingId === req.id && <TestPanel sourceId={sourceId} request={req} />}
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {adding ? (
        <div className="rounded-md border border-border bg-surface p-3">
          <RequestForm
            sourceId={sourceId}
            onDone={async () => {
              setAdding(false);
              await load();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div>
          <button type="button" className={ghostBtn} onClick={() => setAdding(true)}>
            {t("addRequest")}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {deleting && (
        <ConfirmModal
          message={t("deleteRequestConfirm", { name: deleting.name })}
          confirmLabel={t("delete")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- request form */

function RequestForm({
  sourceId,
  request,
  onDone,
  onCancel,
}: {
  sourceId: string;
  request?: SavedRequest;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const t = useTranslations("dataSources");
  const [name, setName] = useState(request?.name ?? "");
  const [method, setMethod] = useState<HttpMethod>((request?.method as HttpMethod) ?? "GET");
  const [path, setPath] = useState(request?.path ?? "");
  const [queryText, setQueryText] = useState(request ? serializeQuery(request.query) : "");
  const [bodyTemplate, setBodyTemplate] = useState(request?.bodyTemplate ?? "");
  const [cacheEnabled, setCacheEnabled] = useState(request?.cacheEnabled ?? true);
  const [cacheTtlSec, setCacheTtlSec] = useState(
    String(request?.cacheTtlSec ?? DEFAULT_CACHE_TTL_SEC),
  );
  const [retryable, setRetryable] = useState(request?.retryable ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim() !== "" && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        method,
        path: path.trim(),
        query: parseQueryLines(queryText),
        bodyTemplate: method !== "GET" && bodyTemplate.trim() !== "" ? bodyTemplate : null,
        cacheEnabled,
        cacheTtlSec: Number(cacheTtlSec),
        retryable,
      };
      const res = await fetch(
        request
          ? `/api/data-sources/${sourceId}/requests/${request.id}`
          : `/api/data-sources/${sourceId}/requests`,
        {
          method: request ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h4 className="text-sm font-medium text-foreground">
        {request ? t("editRequest") : t("addRequest")}
      </h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("name")}</span>
          <input
            className={inputCls}
            value={name}
            maxLength={100}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("method")}</span>
          <select
            className={inputCls}
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("path")}</span>
        <input
          className={inputCls + " font-mono"}
          placeholder="/weather/{city}"
          value={path}
          maxLength={2000}
          onChange={(e) => setPath(e.target.value)}
        />
        {/* ICU-brace gotcha: the literal {city} example is interpolated as a VALUE. */}
        <span className="text-xs text-foreground-muted">
          {t("pathHelp", { example: "{city}" })}
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("query")}</span>
        <textarea
          className={inputCls + " min-h-20 font-mono"}
          placeholder={"q={city}\nunits=metric"}
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
        />
        <span className="text-xs text-foreground-muted">{t("queryHelp")}</span>
      </label>
      {method !== "GET" && (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("bodyTemplate")}</span>
          <textarea
            className={inputCls + " min-h-24 font-mono"}
            placeholder={'{"query": "{search}"}'}
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
          />
          <span className="text-xs text-foreground-muted">{t("bodyHelp")}</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={cacheEnabled}
            onChange={(e) => setCacheEnabled(e.target.checked)}
          />
          {t("cacheEnabled")}
        </label>
        {cacheEnabled && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            {t("cacheTtl")}
            <input
              type="number"
              min={1}
              max={86400}
              className={inputCls + " w-24"}
              value={cacheTtlSec}
              onChange={(e) => setCacheTtlSec(e.target.value)}
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={retryable}
            onChange={(e) => setRetryable(e.target.checked)}
          />
          {t("retryable")}
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn} disabled={!canSave}>
          {busy ? t("saving") : t("save")}
        </button>
        <button type="button" className={ghostBtn} disabled={busy} onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- test panel */

function TestPanel({ sourceId, request }: { sourceId: string; request: SavedRequest }) {
  const t = useTranslations("dataSources");
  const placeholders = requestPlaceholders(request);
  const [params, setParams] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/data-sources/${sourceId}/requests/${request.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params }),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      setResult((await res.json()) as TestResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      id={`ds-test-${request.id}`}
      className="mt-3 flex flex-col gap-2 border-t border-border pt-3"
    >
      <p className="text-xs text-foreground-muted">{t("testHelp")}</p>
      {placeholders.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {placeholders.map((p) => (
            <label key={p} className="flex flex-col gap-1">
              <span className="font-mono text-xs text-foreground-muted">{`{${p}}`}</span>
              <input
                className={inputCls}
                value={params[p] ?? ""}
                onChange={(e) => setParams({ ...params, [p]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}
      <div>
        <button type="button" className={primaryBtn} disabled={running} onClick={() => void run()}>
          {running ? t("testing") : t("runTest")}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {result &&
        (result.ok ? (
          <div className="flex flex-col gap-1">
            <p role="status" className="text-sm text-success">
              {t("testStatus", { status: result.status })}
            </p>
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        ) : (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
          >
            {t("testFailed", { status: result.status ?? "—" })} {result.error}
          </p>
        ))}
    </div>
  );
}
