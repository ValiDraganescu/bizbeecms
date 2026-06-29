/**
 * Build/runtime failsafe for the dev auth backdoor (see guard.ts DEV_IS_ON).
 *
 * If the dev SuperAdmin flag is ever truthy while NODE_ENV is "production", we
 * throw at module load — a deployed Worker that somehow carried the flag crashes
 * loud on boot instead of silently auto-authing every request as SuperAdmin.
 * guard.ts imports this for side effect, so the check runs wherever the guard does.
 */
if (
  process.env.NODE_ENV === "production" &&
  process.env.CMS_DEV_SUPERADMIN === "1"
) {
  throw new Error(
    "FATAL: CMS_DEV_SUPERADMIN is set in a production build — the dev auth " +
      "backdoor must never ship. Unset it and rebuild.",
  );
}
