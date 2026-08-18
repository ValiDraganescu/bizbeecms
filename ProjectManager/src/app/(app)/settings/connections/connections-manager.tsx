"use client";

/**
 * MCP connections manager (pm-mcp Slice 2): lists the user's active OAuth
 * grants (client name, created, last used, expiry) with revoke, and shows the
 * copy-pasteable Claude Code wiring — no secrets involved: the client discovers
 * our authorization server and runs the browser login/consent flow itself.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertBody, Button, ConfirmDialog } from "@/components/ui";
import type { ConnectionItem } from "@/lib/oauth/store";

function fmt(ts: number | null): string {
  return ts == null ? "—" : new Date(ts).toLocaleDateString();
}

export function ConnectionsManager({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations("settings.connections");
  const [items, setItems] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ConnectionItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/oauth/connections");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConnectionItem[];
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmRevoke() {
    if (!revoking) return;
    const id = revoking.id;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/oauth/connections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((c) => c.id !== id));
      setRevoking(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert tone="danger">
          <AlertBody>{error}</AlertBody>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-foreground-muted">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-foreground-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{c.clientName}</span>
                <span className="text-xs text-foreground-muted">
                  {t("createdAt", { date: fmt(c.createdAt) })} ·{" "}
                  {t("lastUsedAt", { date: fmt(c.lastUsedAt) })} ·{" "}
                  {t("expiresAt", { date: fmt(c.refreshExpiresAt) })}
                </span>
              </div>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRevoking(c)}>
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-2 flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">{t("connectTitle")}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{t("connectIntro")}</p>
        </header>
        <CopyBlock label={t("connectCliLabel")} copyLabel={t("copy")}>
          {`claude mcp add --scope user --transport http bizbee-pm ${mcpUrl}`}
        </CopyBlock>
        <CopyBlock label={t("connectJsonLabel")} copyLabel={t("copy")}>
          {`{
  "mcpServers": {
    "bizbee-pm": { "type": "http", "url": "${mcpUrl}" }
  }
}`}
        </CopyBlock>
        <p className="text-sm text-foreground-muted">{t("connectHint")}</p>
      </section>

      {revoking && (
        <ConfirmDialog
          title={t("revokeTitle")}
          body={t("revokeConfirm", { client: revoking.clientName })}
          confirmLabel={t("revoke")}
          cancelLabel={t("cancel")}
          loading={busy}
          onConfirm={() => void confirmRevoke()}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}

function CopyBlock({
  children,
  label,
  copyLabel,
}: {
  children: string;
  label: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</span>
      <div className="relative">
        <pre className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 pr-20 font-mono text-xs text-foreground">
          {children}
        </pre>
        <button
          type="button"
          className="absolute right-2 top-2 rounded border border-border bg-surface-raised px-2 py-1 text-xs text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "✓" : copyLabel}
        </button>
      </div>
    </div>
  );
}
