import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/nav/app-nav";
import { getCurrentUser, hasAnyUser } from "@/lib/auth/user";

/**
 * Shell for authenticated PM pages: an auth gate plus the floating dock nav.
 * Signed-out visitors are sent to /login (or /register on first run). Individual
 * pages still fetch the current user for their own needs; this gates access and
 * renders the shared navigation (dock on md+, bottom tab bar on phones) once.
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
      {/* Bottom padding keeps the floating dock / tab bar off the last row. */}
      <div className="pb-24 md:pb-28">{children}</div>
      <AppNav user={user} />
    </>
  );
}
