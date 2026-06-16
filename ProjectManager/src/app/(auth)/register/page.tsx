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
import { hasAnyUser } from "@/lib/auth/user";
import { RegisterForm } from "./register-form";

/**
 * First-run registration. Open only while no user exists — the first registrant
 * becomes the SuperAdmin. Once any user exists the route renders a closed state
 * pointing at sign-in; further accounts come through the invite flow.
 */
export default async function RegisterPage() {
  const t = await getTranslations("auth");
  const closed = await hasAnyUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("register.title")}</CardTitle>
        <CardDescription>
          {closed ? t("register.closedSubtitle") : t("register.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {closed ? (
          <>
            <Alert tone="info">
              <AlertTitle>{t("register.closedTitle")}</AlertTitle>
              <AlertBody>{t("register.closedBody")}</AlertBody>
            </Alert>
            <p className="text-sm text-foreground-muted">
              {t("register.haveAccount")}{" "}
              <Link
                href="/login"
                className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {t("login.title")}
              </Link>
            </p>
          </>
        ) : (
          <RegisterForm />
        )}
      </CardContent>
    </Card>
  );
}
