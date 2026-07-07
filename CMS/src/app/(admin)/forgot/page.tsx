import { ForgotPasswordForm } from "@/components/forgot-password-form";

/**
 * Public forgot-password page (auth-reset C4). Not under /admin, so no auth gate —
 * the email field + enumeration-safe forgot endpoint are the whole flow.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
