# Version files by ecosystem

Check in order, stop at the first match. Each entry says where the version lives and how to write it — bump only the named field; preserve the file's formatting and every surrounding key.

1. **Node / JS / TS** — `package.json` → `"version": "X.Y.Z"`. A workspace root with no `version` field → the primary package's `package.json`. Preserve JSON formatting.
2. **Python** — `pyproject.toml` (`[project] version = "X.Y.Z"` or `[tool.poetry] version`), then `setup.py` / `setup.cfg`, then `__version__` in `<pkg>/__init__.py`.
3. **Rust** — `Cargo.toml` → `[package] version = "X.Y.Z"` (workspace: the root or the member that owns the public crate).
4. **Go** — usually no in-tree version file; releases happen via git tags. If `version.go` / a `Version` constant exists, use it; otherwise treat the git tag as the version (no file bump).
5. **Java / Kotlin / JVM** — `build.gradle(.kts)` (`version = "X.Y.Z"`), `pom.xml` (the `<version>` element directly under `<project>` — never a `<parent>` or `<dependency>` version), `gradle.properties` (`version=…`).
6. **.NET / C#** — `Directory.Build.props` or the relevant `*.csproj` (`<Version>` / `<VersionPrefix>`).
7. **PHP** — `composer.json` (`"version"`), if present.
8. **Ruby** — `*.gemspec` (`spec.version`) or `lib/<gem>/version.rb` (`VERSION = "X.Y.Z"`).
9. **Elixir** — `mix.exs` (`@version` or the `version:` key in `project/0`).
10. **Dart / Flutter** — `pubspec.yaml` (`version: X.Y.Z+B`). Bump the SemVer part; when a `+B` build counter is present, increment it by 1.
11. **Swift / Apple platforms** — `*.podspec` (`spec.version`), or an `Info.plist`: set `CFBundleShortVersionString` to the new SemVer string; when `CFBundleVersion` is present (the build counter), increment it by 1 as an integer, independent of the SemVer bump. Every other key stays untouched.
12. **Generic** — a top-level `VERSION` / `version.txt` containing just `X.Y.Z`; overwrite with the new string plus a trailing newline.
