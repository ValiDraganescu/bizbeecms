---
description: Ship the current working-tree changes — inspect the diff, bump the project version per SemVer, commit with a tight message, and push the current branch. Use when the user wants to commit, ship, release, or push what's in the working tree.
allowed-tools: Read, Edit, Bash, Grep, Glob
---

Ship the current working-tree changes end-to-end, with no per-step confirmations. The one reason to stop and ask is genuine ambiguity: a diff that mixes a breaking change with unrelated work so the release intent is unclear, or no way to tell which file holds the project's version.

# Step 1 — Inspect the change

Run these in parallel:
- `git status` (untracked + modified files)
- `git diff HEAD` (full working-tree diff vs HEAD)
- `git log --oneline -20` (recent commit style)
- `git rev-parse --abbrev-ref HEAD` (current branch — you'll push to this)

Read the diff **in full — a large diff too**: the bump level and the commit message both come from knowing what changed and why. If the working tree is clean and nothing is staged, stop and tell the user.

# Step 2 — Locate the version file

Find the project's canonical version source — the per-ecosystem lookup table (where each ecosystem keeps its version, and how to edit that file) is in [`VERSIONS.md`](./VERSIONS.md); check its entries in order and stop at the first match.

If multiple candidates exist (e.g. both `package.json` and `pyproject.toml`), prefer the one matching the dominant language of the diff; still ambiguous → ask the user. If **no version file exists** (a Go module released by tag, a script repo, a docs-only repo), skip Steps 3–4, note it in the report, and proceed with the commit + push.

# Step 3 — Pick the SemVer bump

From the current version `X.Y.Z`, pick by the **largest impact present** in the diff:

- **major** (`X+1.0.0`) — breaking change to the project's public surface: removed/renamed exported function or class, removed/renamed CLI subcommand or flag, breaking change to a network/wire protocol or persisted file format, removed/renamed public API endpoint, dropped support for a runtime/SDK version. Anything that forces a downstream consumer to change their code or data.
- **minor** (`X.Y+1.0`) — additive new functionality: new exported API, new CLI subcommand or flag, new endpoint, new user-visible feature, new optional config key. Backwards-compatible.
- **patch** (`X.Y.Z+1`) — bug fix, performance fix, internal refactor with no public-surface change, dependency bump, doc/comment-only change, test-only change, build/CI tweak, log/telemetry adjustment, config tweak that ships safe defaults.

A patch fix alongside a new feature is still a minor bump — the highest level present wins.

"Public surface" is project-relative — for a library the exported API; for a CLI the subcommand and flag set; for a service its HTTP/RPC contract; for an app the persisted state schema and any documented integrations. If the project's CLAUDE.md or README defines its public surface, defer to that.

Edge cases: pure test additions → patch. Internal-symbol rename with no public-surface impact → patch. Doc-only or housekeeping changes → patch. Genuinely can't tell whether a change is breaking → ask the user one sharp question before bumping.

# Step 4 — Write the version

Update **only** the version field(s), following the format notes in [`VERSIONS.md`](./VERSIONS.md) — surrounding keys and formatting stay untouched. Format-specific build counters (`CFBundleVersion`, pubspec's `+B`) increment by 1 on **every** commit, independent of the SemVer bump.

# Step 5 — Commit message

Use Conventional Commit prefixes matching the repo's style (the `git log` from Step 1): `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `perf:`, `build:`, `ci:`, `style:`. Pick the prefix matching the **dominant** change, not the bump level. A repo whose log uses a different convention (plain imperative subjects, ticket prefixes, gitmoji) gets that style instead.

- Subject line: one sentence, imperative mood, under 72 chars, no trailing period.
- Say the **why** or the user-visible effect, not a file list.
- Multiple unrelated changes still get one subject line — summarize the theme. Add a body only if the user asked for one.
- The version bump stays out of the subject — the version itself communicates it.
- Append whatever trailer the global commit protocol in your context requires, via the HEREDOC form below.

# Step 6 — Stage, commit, push

- Stage the version file (if bumped) plus the other modified/untracked files that belong to the logical change, **by name** — the explicit list is a hard guardrail; `git add -A` / `git add .` would sweep in unrelated files. Files that look like secrets (`.env*`, `credentials*`, `*.p12`, `*.keychain*`, `*.pem`, `id_rsa*`, `*.key`, …) stay unstaged — warn the user if any exist. A candidate that's gitignored is skipped silently.
- Commit with the HEREDOC form:
  ```
  git commit -m "$(cat <<'EOF'
  <subject line>

  <required trailer(s)>
  EOF
  )"
  ```
- Push to the current branch's upstream: `git push origin <current-branch>` (`-u` if no upstream yet). Plain push only — a force-push rewrites shared history. If the current branch IS `master`/`main`, confirm with the user before pushing.

If the pre-commit hook fails, fix the underlying issue, re-stage, and create a **new** commit — the hook-failed commit never happened, so `--amend` would rewrite the *previous* one.

# Step 7 — Report

One or two sentences: new version (or "no version file in this project"), branch pushed, commit subject. Nothing else.
