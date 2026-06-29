/**
 * Built-in client asset for the List block's "combobox" presentation.
 *
 * The List is a renderer PRIMITIVE (no D1 component row), so its interactive
 * behavior can't come from the component registry the way an authored component's
 * `script`/`css` do. It lives here and is injected into the render plan ONCE when
 * a combobox-mode List is actually rendered (`planPage.useBuiltinComboboxAssets`).
 *
 * The renderer (`planComboboxList`) SERVER-STAMPS each option's body from the
 * author's chosen item component (mapped from the row). This script does NOT build
 * options — it ENHANCES the pre-rendered `<li data-cb-option>` nodes: open/close,
 * search filter, single/multiple selection, min/max limits, the selected summary,
 * and writing the selection to the hidden form input. The author's item component
 * is purely visual and never knows about selection.
 *
 * Plain ES5-ish IIFE (no build step) — it ships verbatim and runs via the same
 * post-hydration client-script runner as authored component scripts.
 */

/** Dedup key so the asset is shipped at most once per page. */
export const COMBOBOX_LIST_ASSET_KEY = "__builtin_combobox_list__";

export const COMBOBOX_LIST_CSS = `
/* The shell .cb-hidden helper (trigger side). The panel has its own (it is
   portaled out of this scope — see below). */
[data-combobox-list].cb-root { position: relative; width: 100%; max-width: 28rem; font-size: 0.875rem; }
[data-combobox-list] .cb-hidden { display: none !important; }
[data-combobox-list] .cb-trigger { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 0.5rem; text-align: left; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-foreground); border-radius: 0.5rem; padding: 0.5rem 0.75rem; box-shadow: 0 1px 2px rgba(0,0,0,.05); cursor: pointer; }
[data-combobox-list] .cb-trigger:hover { border-color: var(--color-primary); }
[data-combobox-list] .cb-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-foreground-muted); }
[data-combobox-list] .cb-summary.cb-has-value { color: var(--color-foreground); }
[data-combobox-list] .cb-caret { height: 1rem; width: 1rem; flex: none; color: var(--color-foreground-muted); transition: transform .12s; }

/* The panel is PORTALED to <body> at open, so it is NOT a descendant of
   [data-combobox-list] — its styles must be scoped to [data-cb-panel] itself.
   absolute + page coords (set by the script) → scrolls with the document AND
   escapes any ancestor overflow:hidden / stacking context. Max z so it's on top. */
[data-cb-panel] { position: absolute; z-index: 2147483000; font-size: 0.875rem; overflow: hidden; border: 1px solid var(--color-border); background: var(--color-surface); border-radius: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,.1); }
[data-cb-panel].cb-hidden { display: none !important; }
[data-cb-panel] .cb-hidden { display: none !important; }
[data-cb-panel] .cb-search-wrap { border-bottom: 1px solid var(--color-border); padding: 0.5rem; }
[data-cb-panel] .cb-search { width: 100%; border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-foreground); border-radius: 0.375rem; padding: 0.375rem 0.5rem; }
[data-cb-panel] .cb-search:focus { outline: none; border-color: var(--color-primary); }
[data-cb-panel] .cb-list { max-height: 16rem; overflow-y: auto; padding: 0.25rem 0; margin: 0; list-style: none; }
[data-cb-panel] .cb-opt { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; cursor: pointer; transition: background-color .12s; }
[data-cb-panel] .cb-opt:hover { background: color-mix(in oklab, var(--color-primary) 10%, transparent); }
[data-cb-panel] .cb-opt[aria-selected="true"] { background: color-mix(in oklab, var(--color-primary) 6%, transparent); }
[data-cb-panel] .cb-opt.cb-disabled { opacity: .4; cursor: not-allowed; }
[data-cb-panel] .cb-opt-body { min-width: 0; flex: 1 1 0%; }
[data-cb-panel] .cb-check { flex: none; width: 1rem; height: 1rem; color: var(--color-primary); opacity: 0; }
[data-cb-panel] .cb-opt[aria-selected="true"] .cb-check { opacity: 1; }
[data-cb-panel] .cb-empty { padding: 1rem 0.75rem; text-align: center; color: var(--color-foreground-muted); }
[data-cb-panel] .cb-hint { border-top: 1px solid var(--color-border); padding: 0.375rem 0.75rem; font-size: 0.75rem; color: var(--color-foreground-muted); }
`.trim();

export const COMBOBOX_LIST_SCRIPT = `(function () {
  function num(s, fb) { var n = Number(s); return Number.isFinite(n) ? n : fb; }

  function init(root) {
    if (root.__cbInit) return; root.__cbInit = true;
    var multiple = root.getAttribute("data-cb-multiple") !== "false";
    var min = num(root.getAttribute("data-cb-min"), 0);
    var max = num(root.getAttribute("data-cb-max"), 0);
    var placeholder = root.getAttribute("data-cb-placeholder") || "Select…";

    // Optional admin-authored label expression: a TEMPLATE-LITERAL BODY (e.g.
    // "\${name} ★ \${rating}"), stamped server-side without backticks. We wrap it
    // back in backticks here and compile ONCE in the browser (Workers block
    // Function; this runs client-side). The row is passed as an ARGUMENT — never
    // interpolated into the function body — and \`with(row)\` lets the body
    // reference fields bare ("name" not "row.name"). Same trust level as a
    // component's client script (admin authors both).
    var labelExpr = root.getAttribute("data-cb-label-expr");
    var labelFn = null;
    if (labelExpr) {
      try { labelFn = new Function("row", "with(row){ return (\`" + labelExpr + "\`); }"); }
      catch (e) { labelFn = null; }
    }

    var hidden = root.querySelector("[data-cb-value-input]");
    var trigger = root.querySelector("[data-cb-trigger]");
    var summary = root.querySelector("[data-cb-summary]");
    var caret = root.querySelector("[data-cb-caret]");
    var panel = root.querySelector("[data-cb-panel]");
    var search = root.querySelector("[data-cb-search]");
    var listEl = root.querySelector("[data-cb-list]");
    var empty = root.querySelector("[data-cb-empty]");
    var hint = root.querySelector("[data-cb-hint]");
    var options = [].slice.call(root.querySelectorAll("[data-cb-option]"));

    // The option's human label (trigger chip + search match), in precedence order:
    //  1. label expression evaluated against the option's row JSON (data-cb-row),
    //  2. a resolved field value (data-cb-label),
    //  3. fallback: the option's flattened text content (the stamped component).
    function labelOf(li) {
      if (labelFn) {
        var raw = li.getAttribute("data-cb-row");
        if (raw) {
          try {
            var out = labelFn(JSON.parse(raw));
            if (out != null && out !== "") return String(out);
          } catch (e) { /* bad expr/row → fall through */ }
        }
      }
      var field = li.getAttribute("data-cb-label");
      if (field != null && field !== "") return field;
      return (li.textContent || "").replace(/\\s+/g, " ").trim();
    }

    var selected = []; // option VALUES, in selection order
    var open = false;

    // The panel is portaled to <body> and positioned ABSOLUTELY in PAGE coordinates
    // (rect + scrollX/Y). Two wins, no scroll listener needed:
    //  - reparenting out of the block tree escapes any ancestor overflow:hidden /
    //    stacking context, so it renders above everything;
    //  - absolute page coords scroll WITH the document naturally (a fixed panel
    //    would detach on scroll; that was the bug).
    // Flip above the trigger when there isn't room below in the viewport.
    function position() {
      var r = trigger.getBoundingClientRect();
      var gap = 4;
      var sx = window.scrollX || window.pageXOffset;
      var sy = window.scrollY || window.pageYOffset;
      panel.style.width = r.width + "px";
      panel.style.left = (r.left + sx) + "px";
      var ph = panel.offsetHeight;
      var below = window.innerHeight - r.bottom;
      if (below < ph + gap && r.top > below) {
        panel.style.top = (r.top + sy - ph - gap) + "px"; // flip above
      } else {
        panel.style.top = (r.bottom + sy + gap) + "px";
      }
    }

    function setOpen(v) {
      open = v;
      if (caret) caret.style.transform = v ? "rotate(180deg)" : "";
      if (v) {
        if (panel.parentNode !== document.body) document.body.appendChild(panel);
        panel.classList.remove("cb-hidden");
        position();
        if (search) search.focus();
      } else {
        panel.classList.add("cb-hidden");
      }
    }

    function renderSummary() {
      if (selected.length === 0) { summary.textContent = placeholder; summary.classList.remove("cb-has-value"); return; }
      summary.classList.add("cb-has-value");
      var labels = selected.map(function (val) {
        for (var i = 0; i < options.length; i++) if (options[i].getAttribute("data-cb-value") === val) return labelOf(options[i]);
        return val;
      });
      var shown = labels.slice(0, 3);
      var extra = labels.length - shown.length;
      summary.textContent = shown.join(", ") + (extra > 0 ? ", +" + extra + (extra === 1 ? " item" : " items") : "");
    }

    function renderHint() {
      if (!hint) return;
      var msgs = [];
      if (min > 0 && selected.length < min) msgs.push("Select at least " + min);
      if (max > 0) msgs.push(selected.length + "/" + max + " selected");
      if (msgs.length) { hint.textContent = msgs.join(" · "); hint.classList.remove("cb-hidden"); }
      else hint.classList.add("cb-hidden");
    }

    function syncSelectedClasses() {
      options.forEach(function (li) {
        var on = selected.indexOf(li.getAttribute("data-cb-value")) !== -1;
        li.setAttribute("aria-selected", on ? "true" : "false");
        var atMax = multiple && max > 0 && selected.length >= max && !on;
        li.classList.toggle("cb-disabled", atMax);
      });
    }

    function commit() {
      hidden.value = multiple ? JSON.stringify(selected) : (selected[0] || "");
      root.dispatchEvent(new CustomEvent("combobox:change", {
        bubbles: true,
        detail: { name: root.getAttribute("data-cb-name"), value: multiple ? selected.slice() : (selected[0] || null) }
      }));
      renderSummary(); renderHint(); syncSelectedClasses();
    }

    function toggle(val) {
      var idx = selected.indexOf(val);
      if (!multiple) {
        selected = idx === -1 ? [val] : (min > 0 ? selected : []);
        commit(); setOpen(false); return;
      }
      if (idx === -1) {
        if (max > 0 && selected.length >= max) return;
        selected.push(val);
      } else {
        if (min > 0 && selected.length <= min) return;
        selected.splice(idx, 1);
      }
      commit();
    }

    function applyFilter() {
      var q = (search ? search.value : "").trim().toLowerCase();
      var anyVisible = false;
      options.forEach(function (li) {
        var hit = !q || labelOf(li).toLowerCase().indexOf(q) !== -1;
        li.classList.toggle("cb-hidden", !hit);
        if (hit) anyVisible = true;
      });
      if (empty) empty.classList.toggle("cb-hidden", anyVisible);
    }

    options.forEach(function (li) {
      li.addEventListener("click", function () {
        if (li.classList.contains("cb-disabled")) return;
        toggle(li.getAttribute("data-cb-value"));
      });
    });
    trigger.addEventListener("click", function () { setOpen(!open); });
    if (search) search.addEventListener("input", applyFilter);
    // Outside-click must consider the panel too: it is PORTALED to the body, so it
    // is no longer inside root; a click on an option would otherwise read as outside.
    document.addEventListener("click", function (e) {
      if (open && !root.contains(e.target) && !panel.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) setOpen(false); });
    // Absolute page-coords already scroll WITH the document, but a resize or an
    // ancestor (non-window) scroll can shift the trigger — re-pin on both.
    window.addEventListener("resize", function () { if (open) position(); });
    window.addEventListener("scroll", function () { if (open) position(); }, true);

    commit();
  }

  function boot() {
    var roots = document.querySelectorAll("[data-combobox-list]");
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();`;
