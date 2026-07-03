# Note to the next Meeseeks (site-export-import)

This run shipped the ONE-FILE EXPORT half of the 2026-07-03 user request:
the Export button now downloads a single `site-<name>-<ts>.zip` (`site.json`
+ `assets/<key>` per binary), built CLIENT-SIDE with `fflate`'s `zipSync`
over the unchanged `/api/site-export` + `/api/site-export/asset/<key>`
endpoints. Zero server changes. FORMAT.md §4a has the layout + reasoning
(client-side zip doesn't reopen the Workers-body-size argument that killed
a *server-built* zip in the original FORMAT.md §4 — the browser already
downloaded every asset over N small responses before zipping them).

**Your task: the other half — zip IMPORT** (already queued in BACKLOG.md's
"USER REQUEST 2026-07-03" section, second line):
1. The Import file picker (`ExportImportManager`'s `step==="pick"` input,
   currently `accept="application/json"`) needs to also accept `.zip` —
   detect which one was picked (extension, or peek the first 4 bytes for the
   `PK\x03\x04` zip magic) and branch:
   - Bare `.json` → today's path unchanged (`JSON.parse(file.text())`).
   - `.zip` → `unzipSync(new Uint8Array(await file.arrayBuffer()))` (fflate,
     already a dependency now), pull `unzipped["site.json"]` and
     `JSON.parse(strFromU8(...))` it, then treat every OTHER entry
     (`assets/<file>`) as the asset bytes to upload later.
2. Feed the parsed envelope into the EXISTING `/api/site-import/validate` →
   review → typed-confirm → `/api/site-import` execute flow completely
   unchanged (don't touch those routes or the dry-run report UI at all).
3. Replace the current "pick asset files via a second multi-file `<input>`"
   step with pushing the bytes straight from the ALREADY-unzipped
   `assets/<key>` entries (no second file picker needed once you have a zip
   — you already have every asset's bytes in memory) through the existing
   `POST /api/site-import/asset/<key>` route. **`assetKeysToUpload` from the
   execute response IS the zip entry path verbatim** (both are `asset.key`,
   confirmed this run — no re-derivation/stripping needed, see this run's
   CAVEATS entry about `asset.key` already being `assets/<file>`-namespaced).
4. Keep the bare-`site.json`-only upload path working too (backward compat,
   explicitly required by BACKLOG) — in that case there's no bundled asset
   bytes, so fall back to today's separate multi-file asset picker for that
   branch only.
5. Live-verify a FULL zip round-trip end-to-end: export a real zip from
   :3602, import it into a scratch second instance
   (`CMS/scripts/scratch-instance.sh up <port>` — already built, use it, see
   CAVEATS for the two gotchas already fixed in it), confirm at least one
   asset is sha256-identical after the round trip (`crypto.subtle.digest` or
   Node's `crypto.createHash` on both the pre-zip fetch and the post-import
   R2 object, or just byte-compare like this run's Node sanity check did).

Everything else in BACKLOG.md's `## Tasks` + both "New TODOs" sections is
still DONE from before — don't re-touch those. The goal is otherwise still
"very likely feature-complete" per the prior NEXT.md note; this zip-export/
import pair is genuinely new user-requested scope on top of that baseline,
not a gap in the original build.
