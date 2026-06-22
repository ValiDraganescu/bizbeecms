import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import type { Role } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import {
  getCurrentUser,
  findUserByEmail,
  getUserCountries,
  getUserTagIds,
} from "@/lib/auth/user";
import { normalizeEmail, validateEmail } from "@/lib/auth/validation";
import { authorizeInvite, INVITABLE_ROLES } from "@/lib/invite/authz";
import { createInvite, hasPendingInvite } from "@/lib/invite/invite";
import { sendInviteEmail } from "@/lib/mail/send-invite";

export type InviteErrorKey =
  | "emailRequired"
  | "emailInvalid"
  | "roleInvalid"
  | "countryInvalid"
  | "notAllowed"
  | "roleNotAllowed"
  | "countryNotAllowed"
  | "tagNotAllowed"
  | "emailTaken"
  | "alreadyInvited"
  | "unknown";

export type InviteSuccess = {
  email: string;
  acceptUrl: string;
  delivered: boolean;
};

type Body = {
  email?: unknown;
  role?: unknown;
  countries?: unknown;
  tagIds?: unknown;
};

/** Parse + dedupe the selected country codes (empty = global). */
function parseCountries(raw: unknown): CountryCode[] | "invalid" {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const out = new Set<CountryCode>();
  for (const value of list) {
    if (value === "") continue;
    if (!isCountryCode(value)) return "invalid";
    out.add(value);
  }
  return [...out];
}

/** Parse + dedupe the selected tag ids (non-empty strings). */
function parseTagIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  return [...new Set(list.filter((v) => v !== ""))];
}

function fail(error: InviteErrorKey, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * REST invite endpoint (replaces the former server action). A SuperAdmin or
 * an Admin-with-invite-rights invites a user by email + role (+ country scope),
 * authorized server-side and bounded by the inviter's own scope. On success it
 * returns `{ success: { email, acceptUrl, delivered } }`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const inviter = await getCurrentUser();
  if (!inviter) return fail("notAllowed", 403);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("unknown", 400);
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const role = String(body.role ?? "") as Role;

  const emailError = validateEmail(email);
  if (emailError) return fail(emailError, 400);

  if (!INVITABLE_ROLES.includes(role)) return fail("roleInvalid", 400);

  const countries = parseCountries(body.countries);
  if (countries === "invalid") return fail("countryInvalid", 400);

  // Tags only apply to Manager invites; ignore them for any other role.
  const tagIds = role === "Manager" ? parseTagIds(body.tagIds) : [];

  // Authorization: who may grant this role + country/tag set, bounded by the
  // inviter's own country + tag scope (server-enforced).
  const [inviterCountries, inviterTagIds] = await Promise.all([
    getUserCountries(inviter.id),
    getUserTagIds(inviter.id),
  ]);
  const authzError = authorizeInvite(
    inviter,
    inviterCountries,
    role,
    countries,
    inviterTagIds,
    tagIds,
  );
  if (authzError) return fail(authzError, 403);

  if (await findUserByEmail(email)) return fail("emailTaken", 409);
  if (await hasPendingInvite(email)) return fail("alreadyInvited", 409);

  try {
    const invite = await createInvite({
      email,
      role,
      countries,
      tagIds,
      invitedBy: inviter.id,
    });

    const t = await getTranslations("invites.email");
    const result = await sendInviteEmail({
      to: email,
      token: invite.token,
      subject: t("subject"),
      body: (url) => t("body", { url }),
    });
    return NextResponse.json({
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
