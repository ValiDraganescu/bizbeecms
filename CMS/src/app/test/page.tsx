/**
 * USE-CASE PROOF (delete after verifying).
 *
 * Proves the component model works on a Workers-deployed OpenNext CMS WITHOUT
 * any server-side eval/Function (banned on Workers):
 *
 *   1. A JSON tree -> HTML, rendered SERVER-SIDE via React.createElement.
 *   2. AI-authored client JS shipped to the browser as a <script> string.
 *   3. The browser runs that script, making the SSR'd markup interactive.
 *
 * The `artifact` below stands in for what the AI will emit. The server never
 * executes `artifact.script` — it only renders the tree and forwards the script
 * as text. The browser executes it. Two execution environments, each doing what
 * it's allowed to do.
 */
import { createElement, type ReactNode } from "react";

// ── The component artifact (what the AI produces) ───────────────────────────
type Node =
  | string
  | { tag: string; props?: Record<string, unknown>; children?: Node[] };

type Artifact = { tree: Node; script: string };

// NOTE: every visual style here lives as a `className` STRING inside the tree —
// exactly what the AI emits. None of these class names appear literally in JSX.
// This is the real test: does Tailwind generate CSS for classes that exist only
// as data? Mixes stock utilities (rounded-xl, shadow) with our purpose tokens
// (bg-surface-raised, text-primary, border-border).
const artifact: Artifact = {
  tree: {
    tag: "div",
    props: {
      className:
        "flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-raised p-6 shadow-lg max-w-xs",
    },
    children: [
      {
        tag: "h2",
        props: { className: "m-0 text-lg font-semibold text-foreground" },
        children: ["Counter"],
      },
      // SSR'd initial value. The id is the contract between tree and script.
      {
        tag: "p",
        props: { id: "count", className: "m-0 text-5xl font-bold text-primary" },
        children: ["3"],
      },
      {
        tag: "button",
        props: {
          id: "inc",
          className:
            "cursor-pointer rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary-hover",
        },
        children: ["Increment"],
      },
    ],
  },
  // Client-side behavior. Pure string here; never run on the server.
  script: `
    (function () {
      var p = document.getElementById("count");
      var n = p ? parseInt(p.textContent, 10) || 0 : 0;
      var b = document.getElementById("inc");
      if (b && p) b.addEventListener("click", function () { p.textContent = String(++n); });
    })();
  `,
};

// ── Server-side renderer: JSON tree -> React elements (NO eval) ─────────────
function renderNode(node: Node, key?: number): ReactNode {
  if (typeof node === "string") return node;
  const children = node.children?.map((c, i) => renderNode(c, i));
  return createElement(node.tag, { key, ...node.props }, children);
}

export default function TestPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface p-8 text-foreground">
      <div className="flex flex-col items-center gap-4">
        <p className="m-0 text-xs text-foreground-muted">
          SSR&apos;d from JSON tree · interactivity from shipped client script · no server eval
        </p>
        {renderNode(artifact.tree)}
        {/*
          Ship the AI-authored script to the browser. The server forwards it as
          text; the browser executes it. dangerouslySetInnerHTML here = "this is
          a script tag", not user data — see security note in the chat.
        */}
        <script dangerouslySetInnerHTML={{ __html: artifact.script }} />
      </div>
    </main>
  );
}
