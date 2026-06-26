import { getTranslations } from "next-intl/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkAdmin } from "@/lib/auth/guard";
import type { CmsRole } from "@/db/schema";
import { findUserByEmail, normalizeEmail } from "@/db/user-store";
import { canInvite, canInviteRole, INVITABLE_ROLES } from "@/lib/auth/roles";
import { createInvite, hasPendingInvite } from "@/db/invite-store";
import { sendInviteEmail } from "@/lib/mail/send-invite";
import { inviteSubject } from "@/lib/mail/invite-subject";

/**
 * CMS invite endpoint (cms-auth Slice 4). A Manager+ invites a CMS user by email
 * + role. Server-enforced: the caller must be signed in (`checkAdmin`), able to
 * invite at all (`canInvite`), and able to grant THAT role (`canInviteRole` —
 * strictly below their own tier). On success creates the invite + emails the
 * accept link (degrades to logging in dev) and returns
 * `{ success: { email, acceptUrl, delivered } }`.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */
export type InviteErrorKey =
  | "emailRequired"
  | "emailInvalid"
  | "roleInvalid"
  | "notAllowed"
  | "roleNotAllowed"
  | "emailTaken"
  | "alreadyInvited"
  | "unknown";

export type InviteSuccess = {
  email: string;
  acceptUrl: string;
  delivered: boolean;
};

type Body = { email?: unknown; role?: unknown };

function fail(error: InviteErrorKey, status: number): Response {
  return Response.json({ error }, { status });
}

// Minimal, non-leaky email check (matches the spirit of PM's validateEmail).
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request): Promise<Response> {
  const decision = await checkAdmin(request);
  if (!decision.allow || !decision.userId || !decision.role) {
    return fail("notAllowed", 403);
  }
  const inviterRole: CmsRole = decision.role;
  if (!canInvite(inviterRole)) return fail("notAllowed", 403);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("unknown", 400);
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const role = String(body.role ?? "") as CmsRole;

  if (!email) return fail("emailRequired", 400);
  if (!isValidEmail(email)) return fail("emailInvalid", 400);
  if (!INVITABLE_ROLES.includes(role)) return fail("roleInvalid", 400);

  // The granted role must be strictly below the inviter's tier.
  if (!canInviteRole(inviterRole, role)) return fail("roleNotAllowed", 403);

  if (await findUserByEmail(email)) return fail("emailTaken", 409);
  if (await hasPendingInvite(email)) return fail("alreadyInvited", 409);

  try {
    const invite = await createInvite({
      email,
      role,
      invitedBy: decision.userId,
    });

    const t = await getTranslations("inviteEmail");
    const { env } = await getCloudflareContext({ async: true });
    const appOrigin = (env as unknown as { APP_ORIGIN?: string }).APP_ORIGIN;
    const result = await sendInviteEmail({
      to: email,
      token: invite.token,
      subject: inviteSubject(appOrigin, t("subject"), (domain) =>
        t("subjectWithDomain", { domain }),
      ),
      body: (url) => t("body", { url }),
    });
    return Response.json({
      success: {
        email,
        acceptUrl: result.acceptUrl,
        delivered: result.delivered,
      } satisfies InviteSuccess,
    });
  } catch {
    return fail("unknown", 500);
  }
}
