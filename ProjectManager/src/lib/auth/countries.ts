/**
 * Fixed set of country scopes for PM users/invites. `country` on a user/invite
 * scopes an Admin/Manager to that country; `null` means global (no scope).
 *
 * This is the server-side source of truth — invite validation rejects any code
 * not in this list. The display names are i18n-agnostic ISO short names; the
 * "global" option is represented as a null country (see GLOBAL_COUNTRY).
 */

export const COUNTRY_CODES = ["FI", "EE", "SE", "NO", "DK"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

/** Sentinel the invite form uses for "no country scope" (stored as null). */
export const GLOBAL_COUNTRY = "GLOBAL";

export const countryNames: Record<CountryCode, string> = {
  FI: "Finland",
  EE: "Estonia",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
};

export function isCountryCode(value: string | null | undefined): value is CountryCode {
  return value != null && (COUNTRY_CODES as readonly string[]).includes(value);
}
