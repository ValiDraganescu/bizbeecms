/**
 * Consent decision (cms-mcp → OAuth): the same-origin form POST from the consent
 * page. Re-validates the request against the registered client (never trust the
 * hidden fields alone), requires the CMS session, and — on approve — mints a
 * single-use PKCE-bound authorization code and 302s to the client's redirect
 * URI. CSRF: SameSite=lax session cookie + Origin/Sec-Fetch-Site same-origin
 * check; a cross-site POST cannot obtain a code.
 */
import { currentUser as getCurrentUser } from "@/lib/auth/guard";
import { buildRedirect, parseAuthorizeRequest } from "@/lib/oauth/core";
import { issuerFromRequest } from "@/lib/oauth/issuer";
import { createCode, findClient } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const issuer = await issuerFromRequest(request);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameOrigin =
    (origin != null && origin.replace(/\/+$/, "") === issuer) ||
    (origin == null && (fetchSite === "same-origin" || fetchSite === null));
  if (!sameOrigin) return new Response("cross-site request refused", { status: 403 });

  const user = await getCurrentUser();
  if (!user) return new Response("sign in required", { status: 401 });

  const form = await request.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === "string") params.set(k, v);
  params.set("response_type", "code");
  params.set("code_challenge_method", "S256");

  const client = await findClient(params.get("client_id") ?? "");
  const parsed = parseAuthorizeRequest(params, client, `${issuer}/mcp`);
  if (!parsed.ok) {
    if (parsed.redirectable) {
      return Response.redirect(
        buildRedirect(parsed.redirectUri, {
          error: parsed.error,
          error_description: parsed.description,
          state: parsed.state,
        }),
        302,
      );
    }
    return new Response(`${parsed.error}: ${parsed.description}`, { status: 400 });
  }
  const req = parsed.value;

  if (form.get("decision") !== "approve") {
    return Response.redirect(
      buildRedirect(req.redirectUri, {
        error: "access_denied",
        error_description: "the user denied the request",
        state: req.state,
      }),
      302,
    );
  }

  const code = await createCode({
    clientId: req.clientId,
    userId: user.id,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    scope: req.scope,
  });
  return Response.redirect(buildRedirect(req.redirectUri, { code, state: req.state }), 302);
}
