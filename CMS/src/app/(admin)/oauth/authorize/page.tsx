import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { CmsRole } from "@/db/schema";
import { LoginGate } from "@/components/login-gate";
import { currentUser } from "@/lib/auth/guard";
import { buildRedirect, parseAuthorizeRequest } from "@/lib/oauth/core";
import { issuerFromHeaders } from "@/lib/oauth/issuer";
import { findClient } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

const roleKey: Record<CmsRole, string> = {
  SuperAdmin: "superAdmin",
  Admin: "admin",
  Manager: "manager",
  Editor: "editor",
};

/** Two-letter avatar initials from an email local part ("vali.d" → "VD"). */
function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  const pick = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return pick.toUpperCase();
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("oauth.consent");
  return { title: t("pageTitle") };
}

/**
 * OAuth 2.1 consent page (cms-mcp → OAuth; the PM "Handshake" design ported
 * onto the CMS tokens). An MCP client sends the user here; a signed-out visitor
 * gets the in-CMS login page IN PLACE (`LoginGate` with this URL as returnTo, so
 * password/SSO/Google all land back on this request); a signed-in user sees WHO
 * is asking, WHO will be acting, and WHAT that means. Approve/Deny are a plain
 * same-origin form POST to `/oauth/authorize/decision` (a route handler — no
 * server actions) which mints the code and 302s back to the client.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("oauth.consent");
  const tApp = await getTranslations("app");
  const tRoles = await getTranslations("roles");
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const user = await currentUser();
  if (!user) {
    return <LoginGate returnTo={`/oauth/authorize?${params.toString()}`} />;
  }

  const issuer = await issuerFromHeaders(await headers());
  const client = await findClient(params.get("client_id") ?? "");
  const parsed = parseAuthorizeRequest(params, client, `${issuer}/mcp`);

  const shell = (children: ReactNode) => (
    <div className="flex min-h-svh flex-col bg-surface">
      <header className="flex items-baseline gap-2 px-6 py-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">{tApp("name")}</span>
        <span className="text-sm text-foreground-muted">{tApp("cms")}</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );

  if (!parsed.ok) {
    if (parsed.redirectable) {
      redirect(
        buildRedirect(parsed.redirectUri, {
          error: parsed.error,
          error_description: parsed.description,
          state: parsed.state,
        }),
      );
    }
    return shell(
      <div
        role="alert"
        className="flex flex-col gap-1 rounded-md border border-danger bg-danger-subtle px-4 py-3 text-danger"
      >
        <span className="font-semibold">{t("invalidTitle")}</span>
        <span className="text-sm">
          {parsed.error}: {parsed.description}
        </span>
      </div>,
    );
  }
  const req = parsed.value;
  const clientName = client!.name;
  const siteHost = (() => {
    try {
      return new URL(issuer).host;
    } catch {
      return issuer;
    }
  })();
  const redirectHost = (() => {
    try {
      return new URL(req.redirectUri).host || req.redirectUri;
    } catch {
      return req.redirectUri;
    }
  })();

  return shell(
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface-raised text-foreground shadow-sm">
      {/* Handshake header: client ⇢ bizbee */}
      <div className="flex flex-col items-center gap-4 border-b border-border bg-surface-muted px-6 pb-5 pt-7">
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-raised text-foreground">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary opacity-35" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary opacity-60" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold tracking-tight text-primary-foreground">
            bb
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-lg font-semibold leading-tight tracking-tight">
            {t("title", { client: clientName })}
          </h1>
          <p className="text-[13px] leading-snug text-foreground-muted">
            {t("subtitle", { site: siteHost })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {/* Identity chip */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
            {initials(user.email)}
          </div>
          <div className="flex min-w-0 flex-grow flex-col">
            <span className="text-[11px] leading-tight text-foreground-muted">{t("actingAs")}</span>
            <span className="truncate text-[13px] font-medium leading-snug">{user.email}</span>
          </div>
          <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] font-medium text-primary">
            {tRoles(roleKey[user.role])}
          </span>
        </div>

        {/* Capabilities */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            {t("canTitle")}
          </span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(["can1", "can2", "can3"] as const).map((k) => (
              <li key={k} className="flex items-start gap-2.5 text-[13px] leading-snug">
                <svg
                  className="mt-px shrink-0 text-success"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footnote */}
        <div className="flex items-start gap-2.5 text-xs leading-snug text-foreground-muted">
          <svg
            className="mt-px shrink-0 text-warning"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {t.rich("footnote", {
              host: () => <span className="font-mono text-foreground">{redirectHost}</span>,
            })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <form method="post" action="/oauth/authorize/decision" className="flex flex-col gap-2 px-6 pb-6 pt-1">
        <input type="hidden" name="client_id" value={req.clientId} />
        <input type="hidden" name="redirect_uri" value={req.redirectUri} />
        <input type="hidden" name="code_challenge" value={req.codeChallenge} />
        <input type="hidden" name="scope" value={req.scope} />
        {req.state != null && <input type="hidden" name="state" value={req.state} />}
        <button
          type="submit"
          name="decision"
          value="approve"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("approve")}
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="w-full rounded-md px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("deny")}
        </button>
      </form>
    </div>,
  );
}
