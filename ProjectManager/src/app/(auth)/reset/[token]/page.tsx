import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { ResetForm } from "./reset-form";

/**
 * Public "set a new password" page reached from a reset-email link. The token is
 * bound from the route and validated server-side on submit by `/api/auth/reset`,
 * which collapses every failure (invalid/expired/used) into one generic error —
 * so we always render the form and surface that generic error on a bad token.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("auth");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reset.title")}</CardTitle>
        <CardDescription>{t("reset.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetForm token={token} />
      </CardContent>
    </Card>
  );
}
