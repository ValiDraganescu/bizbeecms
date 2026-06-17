import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/nav/app-nav";
import { getCurrentUser, hasAnyUser } from "@/lib/auth/user";

/**
 * Shell for authenticated PM pages: an auth gate plus the persistent top nav.
 * Signed-out visitors are sent to /login (or /register on first run). Individual
 * pages still fetch the current user for their own needs; this gates access and
 * renders the shared navigation (Sites / Invite / sign-out) in one place.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect((await hasAnyUser()) ? "/login" : "/register");
  }
  return (
    <>
      <AppNav user={user} />
      {children}
    </>
  );
}
