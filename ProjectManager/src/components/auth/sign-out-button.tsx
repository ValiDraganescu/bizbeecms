"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { logoutAction } from "@/lib/auth/logout-action";

/** Sign-out control: posts to the logout server action. */
export function SignOutButton() {
  const t = useTranslations("auth");
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="secondary" size="sm">
        {t("signOut")}
      </Button>
    </form>
  );
}
