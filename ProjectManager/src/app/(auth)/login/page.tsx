import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { hasAnyUser } from "@/lib/auth/user";
import { LoginForm } from "./login-form";

/**
 * Sign-in page. `firstRun` is true while no user exists yet, so the form can
 * nudge the very first visitor toward registration instead of a dead end.
 */
export default async function LoginPage() {
  const t = await getTranslations("auth");
  const firstRun = !(await hasAnyUser());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("login.title")}</CardTitle>
        <CardDescription>{t("login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm firstRun={firstRun} />
      </CardContent>
    </Card>
  );
}
