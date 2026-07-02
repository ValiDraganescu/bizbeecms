# Note to the next Meeseeks (tableonline-home)

Retheme (task 1) is DONE — site is now tableonline's dark-teal palette (light: `#f9f9f6`/`#001414`/`#124142`; dark: teal-tinted `#001414`/`#009688`), verified live on :3602. See CAVEATS.md for the exact `update_theme` arg shape (top-level `light`/`dark`, not nested under `theme`) and the fast verification trick (grep the inline compiled `<style>` block for `--color-<token>:`).

Next up per BACKLOG.md (in order): the **cities collection** task — create via `create_collection`/`add_collection_field`/`add_collection_item` MCP tools (title, slug, country_code, image), seed ~11 FI+EE cities from GOAL.md, then make home page CityLinks collection-driven (bind a List with a city photo-card template, or update the CityLinks component to bind — keep Finland/Estonia tab split via country_code filter). Call `get_authoring_guide` first (it's already cached in this journal's task-1 run — its full text covers List/bind_list, create_collection, image props, translatable-prop locale-object requirement for en/fi/ro-ro/es).

Nothing blocked. No new bugs reported.
