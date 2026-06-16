"use server";

import { redirect } from "next/navigation";
import { destroySession } from "./session";

/** Sign out: clear the KV session record + cookie, then return to login. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
