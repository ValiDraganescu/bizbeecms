#!/usr/bin/env bash
# scratch-instance.sh — spin up (or tear down) a genuinely SECOND local CMS
# instance for cross-instance E2E testing (site-export-import goal).
#
# Turbopack (`next dev`) refuses any symlinked path outside its own project
# root, so the only working approach is a real sibling directory with
# node_modules/src/etc. PHYSICALLY COPIED — see CAVEATS.md. This script
# automates exactly that manual recipe, nothing more.
#
# Usage:
#   scripts/scratch-instance.sh up [port]     # default port 3603
#   scripts/scratch-instance.sh down
#
# up:   copies CMS/ into ../bizbeecms-scratch2 (sibling of the repo root,
#       never committed), writes its own wrangler.jsonc name + .dev.vars,
#       applies all D1 migrations there, then runs `next dev --port <port>`
#       in the foreground (Ctrl-C to stop; the dir is left on disk so repeat
#       runs are cheap — re-run `up` to re-copy src after editing it).
# down: kills anything on the port and rm -rf's the scratch directory.
#
# ponytail: no npm dep, no port/dir auto-detection beyond one default — this
# is a dev-only test helper, not shipped product code.

set -euo pipefail

CMS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$CMS_DIR/.." && pwd)"
# Sibling of the repo root, NOT inside it — Turbopack refuses symlinks and
# `git status` would otherwise flag this as an untracked in-repo dir.
SCRATCH_DIR="$(cd "$REPO_ROOT/.." && pwd)/bizbeecms-scratch2"
PORT="${2:-3603}"

case "${1:-}" in
  up)
    mkdir -p "$SCRATCH_DIR"
    echo "==> copying CMS/ into $SCRATCH_DIR (node_modules/src/messages/migrations/scripts[/public])"
    for d in node_modules src messages migrations scripts public; do
      [ -d "$CMS_DIR/$d" ] || continue
      rm -rf "$SCRATCH_DIR/$d"
      cp -R "$CMS_DIR/$d" "$SCRATCH_DIR/$d"
    done
    for f in package.json package-lock.json tsconfig.json next.config.ts \
             postcss.config.mjs open-next.config.ts drizzle.config.ts \
             cloudflare-env.d.ts next-env.d.ts .env.local; do
      cp "$CMS_DIR/$f" "$SCRATCH_DIR/$f" 2>/dev/null || true
    done

    # wrangler.jsonc with a cosmetic distinct `name` (JSON-with-comments —
    # sed the one line rather than round-tripping through a JSONC parser).
    sed 's/"name": "bizbeecms-cms"/"name": "bizbeecms-cms-scratch2"/' \
      "$CMS_DIR/wrangler.jsonc" > "$SCRATCH_DIR/wrangler.jsonc"

    cat > "$SCRATCH_DIR/.dev.vars" <<EOF
CMS_AUTH_SECRET=eKzcWYEqen8trTSU/9BHSnd4XECM1ZC4TjJuI+QvSZbUR9IR
SITE_ID=test-2-scratch
PM_ORIGIN=https://bizbee.localhost
APP_ORIGIN=http://localhost:$PORT
EOF

    echo "==> applying D1 migrations to the scratch instance's OWN local D1"
    (cd "$SCRATCH_DIR" && npx wrangler d1 migrations apply bizbeecms-cms --local)

    echo "==> starting next dev --port $PORT in $SCRATCH_DIR (Ctrl-C to stop)"
    (cd "$SCRATCH_DIR" && npx next dev --port "$PORT")
    ;;
  down)
    echo "==> killing anything on port $PORT"
    lsof -ti tcp:"$PORT" | xargs -r kill 2>/dev/null || true
    echo "==> removing $SCRATCH_DIR"
    rm -rf "$SCRATCH_DIR"
    ;;
  *)
    echo "usage: $0 up [port] | down [port]" >&2
    exit 1
    ;;
esac
