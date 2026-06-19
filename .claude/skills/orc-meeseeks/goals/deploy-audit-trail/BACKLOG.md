# Backlog — deploy-audit-trail
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
(Vertical slices, ordered so each leaves the deploy working. Core trail first, RAM last.)

- TODO: **Verify end-to-end.** `npx opennextjs-cloudflare build` green; a real deploy produces a full
  ordered trail with timings; a forced step failure records the error; emit failure does not break deploy.
