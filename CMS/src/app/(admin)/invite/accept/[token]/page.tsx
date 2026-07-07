import { getTranslations } from "next-intl/server";
import { checkInvite } from "@/db/invite-store";
import { AcceptInviteForm } from "@/components/accept-invite-form";

/**
 * Public accept-invite page (cms-auth Slice 4). Gates on the token status BEFORE
 * showing the password form: a notFound/expired/accepted invite renders a notice
 * instead. A valid invite renders the password form (which POSTs to the accept
 * route). Not under /admin, so no auth guard — the token IS the credential.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { status, invite } = await checkInvite(token);
  const t = await getTranslations("acceptInvite");

  if (status === "valid" && invite) {
    return <AcceptInviteForm token={token} email={invite.email} />;
  }

  const noticeKey =
    status === "expired"
      ? "errorExpired"
      : status === "accepted"
        ? "errorAccepted"
        : "errorNotFound";

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
      <p
        role="alert"
        className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
      >
        {t(noticeKey)}
      </p>
    </main>
  );
}
