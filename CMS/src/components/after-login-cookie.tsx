"use client";

import { useEffect } from "react";
import { AFTER_LOGIN_COOKIE } from "@/lib/auth/guard-core";

/**
 * Stamps the short-lived `bb_after_login` cookie with the page to return to
 * after a login that round-trips through an external callback (PM SSO, Google).
 * Only the OAuth consent page renders this (a same-origin path; the callbacks
 * re-validate it via `afterLoginTarget` before redirecting).
 */
export function AfterLoginCookie({ path }: { path: string }) {
  useEffect(() => {
    document.cookie = `${AFTER_LOGIN_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=600; SameSite=Lax`;
  }, [path]);
  return null;
}
