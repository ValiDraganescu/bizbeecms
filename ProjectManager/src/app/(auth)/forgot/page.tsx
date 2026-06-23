import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { ForgotForm } from "./forgot-form";

/**
 * Public "forgot password" page. Submitting the email form hits the
 * enumeration-safe `/api/auth/forgot` endpoint, which always returns the same
 * response whether or not the email matches a user — so the page shows the same
 * "if an account exists…" message either way.
 */
export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("forgot.title")}</CardTitle>
        <CardDescription>{t("forgot.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotForm />
      </CardContent>
    </Card>
  );
}
