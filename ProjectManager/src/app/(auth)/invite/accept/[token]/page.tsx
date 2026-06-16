import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import type { Role } from "@/db/schema";
import { checkInvite } from "@/lib/invite/invite";
import { AcceptForm } from "./accept-form";

const roleKey: Record<Role, string> = {
  SuperAdmin: "superAdmin",
  Admin: "admin",
  SiteManager: "siteManager",
};

/**
 * Public accept-invite page. The token is validated server-side; only a valid,
 * unexpired, unused invite shows the set-password form. Everything else renders
 * a localized notice that points back to sign-in.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("invites.accept");
  const tRoles = await getTranslations("roles");
  const { status, invite } = await checkInvite(token);

  if (status !== "valid" || !invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invalidTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert tone="warning">
            <AlertTitle>{t(`status.${status}.title`)}</AlertTitle>
            <AlertBody>{t(`status.${status}.body`)}</AlertBody>
          </Alert>
          <p className="text-sm text-foreground-muted">
            <Link
              href="/login"
              className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {t("goToSignIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("subtitle", {
            email: invite.email,
            role: tRoles(roleKey[invite.role]),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptForm token={token} />
      </CardContent>
    </Card>
  );
}
