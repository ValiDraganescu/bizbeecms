---
description: Bump version (SemVer), commit, and push the current branch. Inspects the diff, picks major/minor/patch, writes the version file, and pushes.
allowed-tools: Read, Edit, Bash, Grep, Glob
---

Your task: ship the current working-tree changes. Inspect what changed, bump the project's version using SemVer (if the project has a version file), update it, commit with a tight message, and push to the current branch's upstream.

You do this end-to-end without asking the user to confirm each step. Only stop to ask if something is genuinely ambiguous (e.g. the diff mixes a breaking change with unrelated patch-level work and you can't tell what the user intends to release, or you cannot determine which file holds the project's version).

# Step 1 — Inspect the change

Run these in parallel:
- `git status` (see untracked + modified files)
- `git diff HEAD` (full working-tree diff vs HEAD)
- `git log --oneline -20` (recent commit style)
- `git rev-parse --abbrev-ref HEAD` (current branch — you'll push to this)

Read the diff carefully. You need to know **what changed and why** before you can pick a bump level or write a commit message. If the diff is large, read it in full anyway — don't skim.

If there are no changes to commit (working tree clean and nothing staged), stop and tell the user.

# Step 2 — Locate the version file

Find the canonical version source for this project. Check, in order, and stop at the first match:

1. **Node / JS / TS** — `package.json` → `"version": "X.Y.Z"`. If a workspace root with no `version` field, look for the primary package's `package.json` instead.
2. **Python** — `pyproject.toml` (`[project] version = "X.Y.Z"` or `[tool.poetry] version`), then `setup.py` / `setup.cfg`, then `__version__` in `<pkg>/__init__.py`.
3. **Rust** — `Cargo.toml` → `[package] version = "X.Y.Z"` (workspace: the root or member that owns the public crate).
4. **Go** — usually no in-tree version file; releases happen via git tags. If `version.go` / a `Version` constant exists, use it; otherwise treat the git tag as the version (see Step 3 fallback).
5. **Java / Kotlin / JVM** — `build.gradle(.kts)` (`version = "X.Y.Z"`), `pom.xml` (`<version>X.Y.Z</version>` of the project, not a parent/dependency), `gradle.properties` (`version=…`).
6. **.NET / C#** — `Directory.Build.props` or the relevant `*.csproj` (`<Version>` / `<VersionPrefix>`).
7. **PHP** — `composer.json` (`"version"`), if present.
8. **Ruby** — `*.gemspec` (`spec.version`) or `lib/<gem>/version.rb` (`VERSION = "X.Y.Z"`).
9. **Elixir** — `mix.exs` (`@version` or the `version:` key in `project/0`).
10. **Dart / Flutter** — `pubspec.yaml` (`version: X.Y.Z+B`).
11. **Swift / Apple platforms** — `*.podspec` (`spec.version`), or an `Info.plist` with `CFBundleShortVersionString` (also has `CFBundleVersion` as a build counter — see Step 3).
12. **Generic** — a top-level `VERSION` or `version.txt` file containing just `X.Y.Z`.

If multiple candidates exist (e.g. both `package.json` and `pyproject.toml`), prefer the one that matches the dominant language of the diff. If still ambiguous, ask the user.

If **no version file exists** (e.g. a Go module released by tag, a script repo, a docs-only repo), skip Step 3 entirely. Note in your final report that no version file was bumped, and proceed with the commit + push.

# Step 3 — Pick the SemVer bump

Use the version found in Step 2 as the current version (`X.Y.Z`). Pick the bump by the largest impact present in the diff:

- **major** (`X+1.0.0`) — breaking change to the project's public surface: removed/renamed exported function or class, removed/renamed CLI subcommand or flag, breaking change to a network/wire protocol or persisted file format, removed/renamed public API endpoint, dropped support for a runtime/SDK version. Anything that forces a downstream consumer to change their code or data.
- **minor** (`X.Y+1.0`) — additive new functionality: new exported API, new CLI subcommand or flag, new endpoint, new user-visible feature, new optional config key. Backwards-compatible.
- **patch** (`X.Y.Z+1`) — bug fix, performance fix, internal refactor with no public-surface change, dependency bump, doc/comment-only change, test-only change, build/CI tweak, log/telemetry adjustment, config tweak that ships safe defaults.

When the diff mixes levels, pick the **highest** level present. A patch fix alongside a new feature is still a minor bump.

"Public surface" is project-relative — for a library it's the exported API; for a CLI it's the subcommand and flag set; for a service it's its HTTP/RPC contract; for an app it's the persisted state schema and any documented integrations. If the project's CLAUDE.md or README defines its public surface, defer to that.

Edge cases:
- Pure test additions with no source change → patch.
- Rename of an internal symbol with no public-surface impact → patch.
- Doc-only or housekeeping changes (moving files inside a `done/` archive, formatting, etc.) → patch.
- If you genuinely cannot tell whether a change is breaking, ask the user one sharp question before bumping.

# Step 4 — Write the version

Update **only** the version field(s) in the file you identified. Do not touch unrelated keys.

Per-format notes:
- `package.json` — preserve JSON formatting; bump only `"version"`.
- `Cargo.toml` / `pyproject.toml` / `mix.exs` — bump only the `version` line; preserve TOML/Elixir formatting and surrounding keys.
- `pom.xml` — bump only the project's `<version>` element (the one directly under `<project>`, not a `<parent>` or `<dependency>`).
- `Info.plist` — set `CFBundleShortVersionString` to the new SemVer string. If `CFBundleVersion` is present (the build counter), increment it by 1 as an integer — independent of the SemVer bump. Do not touch any other key.
- `pubspec.yaml` — Dart/Flutter format is `X.Y.Z+B`; bump SemVer and, if a `+B` build counter is present, increment it by 1.
- Plain `VERSION` / `version.txt` — overwrite the contents with the new SemVer string and a trailing newline.

For any format-specific build counter (e.g. `CFBundleVersion`, pubspec `+B`), increment it on every commit even when the SemVer part stays the same.

# Step 5 — Commit message

Use Conventional Commit prefixes matching the repo's style (see `git log` output from Step 1): `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `perf:`, `build:`, `ci:`, `style:`. Pick the prefix that matches the **dominant** change, not the bump level. If the repo's existing log uses a different convention (e.g. plain imperative subjects, ticket prefixes, gitmoji), match that style instead.

Rules:
- Subject line: one sentence, imperative mood, under 72 chars, no trailing period.
- Focus on the **why** or the user-visible effect, not a file list.
- If multiple unrelated things changed, still keep the subject to one line — summarize the theme. Do not add a body unless the user asked for one.
- Do NOT mention the version bump in the subject (the tag/version itself communicates that).
- Include the Claude co-author trailer via HEREDOC, exactly as the global commit protocol requires.

# Step 6 — Stage, commit, push

- Stage the version file (if any was bumped) plus any other modified/untracked files that are part of the logical change. **Never** use `git add -A` or `git add .` — add files by name. Skip files that look like secrets (`.env*`, `credentials*`, `*.p12`, `*.keychain*`, `*.pem`, `id_rsa*`, `*.key`, etc.) and warn the user if any exist.
- Respect `.gitignore`: if a candidate file is ignored, skip it silently.
- Commit with the HEREDOC form:
  ```
  git commit -m "$(cat <<'EOF'
  <subject line>

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
- Push to the current branch's upstream: `git push origin <current-branch>`. If the branch has no upstream yet, push with `-u` to set it. Do not force-push. Do not push to `master`/`main` unless the current branch already is one — and if it is, confirm with the user first.

If the pre-commit hook fails, fix the underlying issue, re-stage, and create a **new** commit (never `--amend` after a hook failure — the prior commit didn't happen, amending would rewrite the previous one).

# Step 7 — Report

One or two sentences: new version (or "no version file in this project"), branch pushed, commit subject. Nothing else.
