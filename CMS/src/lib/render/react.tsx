/**
 * React adapter for the pure render plan (Milestone 2, epic A2).
 *
 * Turns the serializable `ElementPlan` (from the pure `tree.ts` walker) into
 * React elements via `createElement` — a DATA WALK, never eval/Function (those
 * are permanently blocked on Workers). Kept separate from `tree.ts` so the
 * walker stays React-free and unit-testable with dep-free `node --test`.
 */
import { createElement, Fragment, type ReactNode } from "react";
import type { ElementPlan } from "./tree";
import { htmlPropsToReact } from "./react-props";

export function renderPlan(plan: ElementPlan, key?: number): ReactNode {
  if (plan.kind === "text") return plan.text;
  // Props are authored as plain HTML/SVG attributes (stroke-width, class, onclick,
  // selected, …). Map them to the React names createElement expects so an AI- or
  // built-in-emitted element renders without React DOM warnings (see react-props).
  const props = htmlPropsToReact(plan.tag, plan.props);
  // Omit children entirely when there are none — React throws if a void element
  // (img, br, input, …) is given even an empty children array. The HTML parser
  // emits `children: []` for void tags, so this is the boundary that handles it.
  if (plan.children.length === 0) {
    return createElement(plan.tag, { key, ...props });
  }
  const children = plan.children.map((c, i) => renderPlan(c, i));
  return createElement(plan.tag, { key, ...props }, children);
}

/** Render a list of element plans as a React fragment. */
export function renderPlans(plans: ElementPlan[]): ReactNode {
  return createElement(
    Fragment,
    null,
    plans.map((p, i) => renderPlan(p, i)),
  );
}
