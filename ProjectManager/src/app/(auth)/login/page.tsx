import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { hasAnyUser } from "@/lib/auth/user";
import { safeNextPath } from "@/lib/auth/cms-sso";
import { LoginForm } from "./login-form";

/**
 * Sign-in page. `firstRun` is true while no user exists yet, so the form can
 * nudge the very first visitor toward registration instead of a dead end.
 * `?next=` (a same-origin path, e.g. the CMS SSO handoff URL) controls where the
 * user lands after sign-in; defaults to home.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth");
  const firstRun = !(await hasAnyUser());
  const next = safeNextPath((await searchParams).next ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("login.title")}</CardTitle>
        <CardDescription>{t("login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm firstRun={firstRun} next={next} />
      </CardContent>
    </Card>
  );
}
