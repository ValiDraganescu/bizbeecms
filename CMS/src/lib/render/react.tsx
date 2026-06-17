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

export function renderPlan(plan: ElementPlan, key?: number): ReactNode {
  if (plan.kind === "text") return plan.text;
  const children = plan.children.map((c, i) => renderPlan(c, i));
  return createElement(plan.tag, { key, ...plan.props }, children);
}

/** Render a list of element plans as a React fragment. */
export function renderPlans(plans: ElementPlan[]): ReactNode {
  return createElement(
    Fragment,
    null,
    plans.map((p, i) => renderPlan(p, i)),
  );
}
