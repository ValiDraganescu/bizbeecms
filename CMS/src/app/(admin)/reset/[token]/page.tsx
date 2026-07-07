import { getTranslations } from "next-intl/server";
import { checkReset } from "@/lib/reset/reset";
import { ResetPasswordForm } from "@/components/reset-password-form";

/**
 * Public reset-password page (auth-reset C4; mirrors PM P4 + invite-accept page).
 * Gates on the token status BEFORE showing the password form: a notFound/expired/
 * used token renders ONE generic notice (no detail leak, matching the C3 route's
 * single `resetTokenInvalid`). A valid token renders the new-password form. Not
 * under /admin, so no auth guard — the token IS the credential.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { status } = await checkReset(token);
  const t = await getTranslations("resetPassword");

  if (status === "valid") {
    return <ResetPasswordForm token={token} />;
  }

  // notFound / expired / used all collapse to one generic notice — no leak.
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
      <p
        role="alert"
        className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
      >
        {t("errorTokenInvalid")}
      </p>
      <a className="text-sm text-primary hover:underline" href="/forgot">
        {t("requestNew")}
      </a>
    </main>
  );
}
