"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

/** Sign-out control: POSTs to the REST endpoint `/api/auth/logout`. */
export function SignOutButton() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore — fall through to redirect; a stale cookie is cleared next visit.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={onSignOut}
    >
      {t("signOut")}
    </Button>
  );
}
