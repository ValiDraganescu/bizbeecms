# Driving the live X Article composer (browser)

The composer autosaves a draft on the user's real account, so this is **publishing-adjacent**: you MAY type the title and body and apply formatting; **Publish**, audience changes, and dialog acceptance stay the user's actions — say so before you start.

This is the workflow that actually works (learned the hard way — follow it):

1. **Load Chrome tools first.** They're deferred: `ToolSearch` for
   `select:mcp__claude-in-chrome__tabs_context_mcp,...computer,...navigate` etc.
   before calling them.
2. **`tabs_context_mcp`** to see the group, then **`tabs_create_mcp`** for a
   fresh tab (leave the user's tabs alone), then **`navigate`** to the composer
   URL. The first navigate sometimes bounces to `chrome://newtab`; just navigate
   again. Screenshot to confirm you're logged in and the editor rendered (it
   loads behind a spinner — `wait` 2s and re-screenshot if blank).
3. **Title:** `computer` `left_click` the "Add a title" field, then `type`.
4. **Body — type it ALL as plain paragraphs first.** Click the "Start writing"
   area and `type` the whole body, one `\n` between paragraphs (single newline =
   new paragraph in this editor). Type headings and command lines as normal
   text for now; format them afterward. Type in a few large chunks, not
   character-poking.
5. **THE PITFALL: the body field can inherit "Heading" style**, so everything
   you type comes out heading-sized. After typing, if the whole body looks
   huge: click into the body, `cmd+a` to select all body text, open the style
   dropdown (the "Heading" button in the toolbar, ~x=882 y=43), and pick
   **Body**. Now everything is normal paragraph text.
6. **Apply headings, top to bottom.** For each section title: `triple_click`
   the line to select it, click the style dropdown, click **Heading** (or
   **Subheading** for a sub-level). The toolbar dropdown shows the styles:
   Heading, Subheading, Body (plus a "To Orchestrator"-style top row that is the
   X bookmark menu, not a text style — ignore it). After each heading the page
   reflows, so **re-screenshot to find the next title's new Y coordinate**
   instead of assuming it.
7. **Bold** (key insight per section): select the phrase, click **B** in the
   toolbar (~x=789 y=43) or `cmd+b`.
8. **Images — two distinct slots, both need the USER to pick the file.** You
   can position the cursor and open the picker, but the macOS file-open dialog
   is a native OS dialog the browser tools CANNOT drive — the user selects the
   file. (a) **Header image:** the grey 5:2 box above the title; click it.
   (b) **Inline image:** put the cursor where it goes (click the end of the
   preceding paragraph, `End`, `Return` to make a fresh empty line), then
   **Insert** menu (toolbar, ~x=1073 y=43) → **Media** → the "Choose a file or
   drag it here" dialog opens. Hand off to the user here, naming the exact file
   path from the article's image placeholder. After they drop it, they add the
   caption. Other Insert options: GIF, Posts (embed tweet), Divider, Code,
   LaTeX, Table.
9. **Beware paragraph-merge when replacing text.** If you `triple_click` a
   paragraph and `type` a replacement that doesn't end in `\n`, it fuses with
   the following paragraph ("…room.But it was…"). Fix: click just before the
   fused word, `Return` to re-split. Zoom in to confirm the break.
10. **Verify** with the **Preview** button (top right) or a final scroll-through
    screenshot. Confirm headings render larger than body and paragraphs are
    cleanly separated.
11. **Stop at the draft.** Report that it's written and autosaved, and that
    Publish is the user's call. Offer/position a header image (X weights it for
    open rates) but let the user pick the actual file.

Coordinate note: the toolbar sits at roughly y=43; the style dropdown opens a
small menu near y=92–159. These drift with window size, so always screenshot
and read positions rather than hard-coding. `triple_click` selects a whole
paragraph/line reliably; a stray click can land in the author-bio footer, so
screenshot to confirm the selection highlight before applying a style.
