"use client";

/**
 * Thin CodeMirror 6 wrapper for the component Develop code editor.
 *
 * Controlled-ish: the parent owns the text. `value` seeds the editor and pushes
 * EXTERNAL changes in (e.g. switching components/tabs); local typing fires
 * `onChange` but does NOT round-trip through `value` on every keystroke (we only
 * dispatch a setState when the incoming `value` actually differs from the doc, so
 * the cursor doesn't jump while typing).
 *
 * Language is swapped via a Compartment so changing `language` doesn't tear down
 * the editor. 100% browser-side — no SSR / Workers concern (the file is a client
 * component and CodeMirror only touches the DOM).
 */

import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { css as cssLang } from "@codemirror/lang-css";
import { html as htmlLang } from "@codemirror/lang-html";

export type CodeLanguage = "json" | "javascript" | "css" | "html";

function langExtension(language: CodeLanguage) {
  if (language === "json") return json();
  if (language === "css") return cssLang();
  if (language === "html") return htmlLang();
  return javascript();
}

export function CodeEditor({
  value,
  language,
  onChange,
}: {
  value: string;
  language: CodeLanguage;
  onChange: (next: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  // Keep the latest onChange without rebuilding the editor each render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Build the EditorView once.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          // Wrap long lines instead of scrolling horizontally.
          EditorView.lineWrapping,
          highlightActiveLine(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          langCompartment.current.of(langExtension(language)),
          // Map the language parse tree's highlight tags to colors. Without this
          // the lang-* extensions parse but render monochrome. `fallback: true`
          // so it also colors when a lang has no theme of its own.
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Build once; language + value are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push EXTERNAL value changes in (component/tab switch) without clobbering the
  // cursor while typing: only replace the doc when it actually differs.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  // Swap the language extension without rebuilding the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(langExtension(language)),
    });
  }, [language]);

  return <div ref={hostRef} className="h-full overflow-auto" />;
}
