import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUser } from "@/lib/auth/user";

/**
 * Root entry. Signed-out visitors go to /login (or /register on first run);
 * authenticated users land on the Sites dashboard (which carries the app nav).
 * The former styleguide body lives at /design-system.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    redirect((await hasAnyUser()) ? "/login" : "/register");
  }
  redirect("/sites");
}
