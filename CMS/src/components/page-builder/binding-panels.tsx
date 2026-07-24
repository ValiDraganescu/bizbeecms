/**
 * Phase-2 binding authoring (Slice C) — the three operator panels of the Block
 * tab, decomposed from this file's former 1.5k-line monolith:
 *
 *  - `BindingPanel`  (binding-panel.tsx) → a NORMAL component block's
 *    single-item `bindings` (collection/api source → query/request → prop map).
 *  - `ListSettings`  (list-settings.tsx) → a built-in `List` block's
 *    `listSource`/`listMap` + template + layout/combobox + the static
 *    per-locale item text (list-item-translatables).
 *  - `FormSettings`  (form-settings.tsx) → a built-in `Form` block's target,
 *    content component and messages/redirect.
 *
 * Shared pickers/editors live in binding-controls.tsx. This barrel stays the
 * public import path (block-inspector, scripts/ssr-bind-panel-check.mjs — whose
 * point-at-an-old-revision CLI arg relies on one module exporting all three).
 */

export { BindingPanel } from "./binding-panel";
export { ListSettings } from "./list-settings";
export { FormSettings } from "./form-settings";
