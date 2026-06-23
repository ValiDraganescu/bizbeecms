#!/usr/bin/env bash
# Deploy bizbeecms Workers. With no args, deploys ALL: applies PM D1 migrations,
# then deploys ProjectManager, deployer, and router. Pass service names to
# deploy only those. Run from anywhere; requires wrangler to be logged in.
#
#   ./deploy.sh                 # all three (+ PM migrations)
#   ./deploy.sh pm              # just ProjectManager (+ migrations)
#   ./deploy.sh deployer router # just those two (no migrations — only PM has a D1)
#
# Service names: pm | deployer | router  (aliases: projectmanager, manager → pm)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# Resolve requested services (default: all). Dedupe-by-flag keeps deploy order
# fixed (migrations → pm → deployer → router) regardless of arg order.
want_pm=false want_deployer=false want_router=false
if [ "$#" -eq 0 ]; then
  want_pm=true want_deployer=true want_router=true
else
  for arg in "$@"; do
    case "$arg" in
      pm|projectmanager|manager) want_pm=true ;;
      deployer)                  want_deployer=true ;;
      router)                    want_router=true ;;
      *) die "unknown service '$arg' (expected: pm | deployer | router)" ;;
    esac
  done
fi

# The PM/CMS build (opennext) corrupts .next if a dev server holds the port.
# Only relevant when deploying PM.
if $want_pm && lsof -ti:3601,3602 >/dev/null 2>&1; then
  die "a dev server is running on 3601/3602 — stop it before deploying PM (the build corrupts .next)."
fi

if $want_pm; then
  step "Applying PM D1 migrations (remote)"
  # opennextjs deploy ships code but NOT migrations — apply them first so the new
  # PM never queries columns that don't exist yet (this is the bug that 500'd the
  # site detail page). Idempotent: already-applied migrations are skipped.
  ( cd ProjectManager && npx wrangler d1 migrations apply bizbeecms --remote )

  step "Deploying ProjectManager (bundle:cms + preflight + opennext)"
  ( cd ProjectManager && npm run deploy )
fi

if $want_deployer; then
  step "Deploying deployer"
  ( cd deployer && npm run deploy )
fi

if $want_router; then
  step "Deploying router"
  ( cd router && npm run deploy )
fi

step "Done."
