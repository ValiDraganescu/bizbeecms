# Backlog — main
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- (vision, deferred) business developers managing many client sites build a personal/shared component library and import their components into each new Site; a future shared registry is the natural extension. Per-site tagging + export/import-by-tag already shipped in `goals/archive/component-kits/` — the registry is the missing piece.
- (later) Gxx — more premade component kits (events, restaurant/menu, real-estate, team/about) follow the SAME pattern as the 5 shipped kits: new `lib/components/<x>-kit.ts` + `{id,build,names}` in the `KITS` registry (`api/components/kit/route.ts`) + `{id,labelKey}` in the `KITS` const (`components-manager.tsx`) + an `install<X>Kit` i18n key (3 catalogs) + a `scripts/<x>-kit.test.mjs`.
