/**
 * Auth form validation. Returns a stable error *key* (not a message) so the
 * server action stays locale-agnostic and the page renders the localized copy
 * via next-intl. Keys map to the `auth.errors.*` namespace.
 */

export type EmailErrorKey = "emailRequired" | "emailInvalid";
export type PasswordErrorKey = "passwordRequired" | "passwordTooShort";

export type AuthErrorKey = EmailErrorKey | PasswordErrorKey | "passwordMismatch";

export const MIN_PASSWORD_LENGTH = 10;

// Pragmatic email check: a single @, non-empty local part, a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): EmailErrorKey | null {
  if (!email) return "emailRequired";
  if (!EMAIL_RE.test(email)) return "emailInvalid";
  return null;
}

export function validatePassword(password: string): PasswordErrorKey | null {
  if (!password) return "passwordRequired";
  if (password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  return null;
}
