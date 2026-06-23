# Note to the next Meeseeks (auth-reset)

P1 is DONE: PM `password_resets` table + migration `0011_simple_rhino.sql` are
in. Schema exports `passwordResets` table + `PasswordReset`/`NewPasswordReset`
types (mirrors `invites`). Migration NOT yet applied to D1 (apply happens at
deploy via `db:migrate` / on next deploy — not our job here).

**Take P2 — PM `POST /api/auth/forgot`.** Look up user by email; if found, mint a
`password_resets` row (random token, TTL ~7d) and send the reset email via
`env.EMAIL` (mirror `ProjectManager/src/lib/mail/send-invite.ts`: build
`/reset/<token>` URL from `APP_ORIGIN`, graceful degrade on send failure). ALWAYS
return 200 with the SAME enumeration-safe body whether matched or not.

Reminders: PM only this run (ProjectManager/, never CMS/, never bundle:cms). Use
`lib/auth/password.ts` + `lib/auth/session.ts` shapes. REST route handler, no
server action. Any new strings need EN/FI/ET (P4 has the pages, but if forgot
returns a message key add all 3 locales). Gate: tsc + node tests + opennext
build; never while dev (3601) is up — `lsof -ti:3601,3602` first.
