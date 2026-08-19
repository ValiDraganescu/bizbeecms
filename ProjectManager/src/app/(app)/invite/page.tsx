import { redirect } from "next/navigation";

/** Invitations moved into the user-management hub — keep old links working. */
export default function InvitePage() {
  redirect("/users");
}
