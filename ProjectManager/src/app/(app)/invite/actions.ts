"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { Role } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import {
  getCurrentUser,
  findUserByEmail,
  getUserCountries,
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
  | "emailTaken"
  | "alreadyInvited"
  | "unknown";

export type InviteState = {
  error?: InviteErrorKey;
  /** On success: the accept link + whether email was actually sent. */
  success?: { email: string; acceptUrl: string; delivered: boolean };
  /** Preserve form input on error. */
  email?: string;
  role?: string;
};

/** Parse + dedupe the selected country codes from the form (empty = global). */
function parseCountries(raw: string[]): CountryCode[] | "invalid" {
  const out = new Set<CountryCode>();
  for (const value of raw) {
    if (value === "") continue;
    if (!isCountryCode(value)) return "invalid";
    out.add(value);
  }
  return [...out];
}

export async function inviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const inviter = await getCurrentUser();
  if (!inviter) return { error: "notAllowed" };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "") as Role;
  const echo = { email, role };

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, ...echo };

  if (!INVITABLE_ROLES.includes(role)) {
    return { error: "roleInvalid", ...echo };
  }

  const countries = parseCountries(formData.getAll("country").map(String));
  if (countries === "invalid") return { error: "countryInvalid", ...echo };

  // Authorization: who may grant this role + country set (server-enforced),
  // bounded by the inviter's own country scope.
  const inviterCountries = await getUserCountries(inviter.id);
  const authzError = authorizeInvite(inviter, inviterCountries, role, countries);
  if (authzError) return { error: authzError, ...echo };

  // Don't invite someone who already has an account or a pending invite.
  if (await findUserByEmail(email)) return { error: "emailTaken", ...echo };
  if (await hasPendingInvite(email)) return { error: "alreadyInvited", ...echo };

  let acceptUrl: string;
  let delivered: boolean;
  try {
    const invite = await createInvite({
      email,
      role,
      countries,
      invitedBy: inviter.id,
    });

    const t = await getTranslations("invites.email");
    const result = await sendInviteEmail({
      to: email,
      token: invite.token,
      subject: t("subject"),
      body: (url) => t("body", { url }),
    });
    acceptUrl = result.acceptUrl;
    delivered = result.delivered;
  } catch {
    return { error: "unknown", ...echo };
  }

  revalidatePath("/invite");
  return { success: { email, acceptUrl, delivered } };
}
