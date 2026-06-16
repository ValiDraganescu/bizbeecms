import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUser } from "@/lib/auth/user";

/**
 * Guard for authenticated PM pages. Signed-out visitors are sent to /login
 * (or /register on first run). Individual pages still fetch the current user
 * for their own needs; this just gates access in one place.
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
  return <>{children}</>;
}
