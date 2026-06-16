---
description: Write a long-form X.com Article (the X Premium long-form feature) as a markdown file. Use when the user asks for an "X article", "x.com article", "Twitter article", or a long-form post for X — NOT a thread of short posts. Produces a single flowing piece that conforms to X's Articles formatting limits and craft guidance.
argument-hint: "[topic / what the article is about]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Your task: write a **long-form X Article** as a markdown file, conforming to the
real constraints and craft rules of X's Articles feature.

The user invoked `/orc-x-article` with the following argument (may be empty):

```
$ARGUMENTS
```

If the argument names a topic, write about that. If it's empty, ask the user
what the article should be about (and, if relevant, what it should make the
reader think/feel/do) before writing.

# First: know what an X Article IS — don't guess

An **X Article** is X's *long-form* publishing feature — a single flowing
essay with a title, header image, and rich formatting. It is **NOT a thread**
of 280-character posts (`1/`, `2/`, …). If the user wanted a thread, that's a
different deliverable — confirm before writing. The two are not interchangeable.

Key facts about the feature (from X's official "About Articles" help page):

- **Eligibility to publish:** X Premium, Premium+, Premium Business, or Premium
  Organizations. Mention this once if the user may not know — you can write the
  article regardless, but they need the subscription to publish it.
- **Where it's composed:** the *Articles* tab in the side nav on x.com → *Write*
  → *Publish*. It lands on their profile's Articles tab.
- **Audience controls** exist (public or Subscribers-only for monetization).

# Supported formatting

Text styling X Articles support:

- Headings and subheadings (a 3-style text dropdown: Heading / Subheading / Body)
- **Bold**, *italics*, ~~strikethrough~~
- Indentation
- Numbered and bulleted lists
- Links

Block elements available from the composer's **Insert** menu (verified live in
the editor): **Media** (image / video / GIF, up to 4 photos per block),
**GIF**, **Posts** (embed a tweet), **Divider**, **Code** (yes — a real code
block exists), **LaTeX**, and **Table**.

**Earlier versions of this skill claimed "no code blocks." That was wrong** —
the Insert menu has a Code option. So fenced code CAN be represented. But note:
markdown fenced blocks pasted as *text* still won't auto-convert; you get a code
block by choosing Insert → Code and pasting into it. For the common case of one
or two short commands, plain indented monospace-ish lines (a `>` blockquote in
the source md) read fine and are less fuss than a code block. Use the real Code
block when the article genuinely shows a multi-line listing.

In the source markdown file, still write commands as indented blockquote lines
(not fenced ```), and note at the top how you handled any code, so the md stays
clean and the human knows whether to use Insert → Code in the composer. Keep the
markdown itself clean — write it so a copy-paste into the X composer needs
minimal cleanup.

# Craft rules — apply ALL of these (they are X's own guidance)

1. **Start with a clear purpose.** Before writing, be able to answer: what
   should the reader think/feel/do afterward, and who is this for? A sharp
   purpose keeps the piece focused.

2. **Nail the title and the hook.** Titles must be *specific*, spark curiosity,
   and promise value. Bad: "Tips for Better Productivity in 2026." Good: "Why
   95% of Productivity Advice Fails." Pair the title with a strong first
   sentence that hooks and eases the reader in. Suggest a header image
   (visually appealing, relevant) — note it in the file even if you can't make
   one.

3. **Structure for skimmability** (most readers are on mobile):
   - Short paragraphs — **2–4 lines max**.
   - A subheading every **3–5 paragraphs**.
   - Prefer bullets and numbered lists over walls of text.
   - **Bold the key insight in almost every section.** (This one is easy to
     forget — don't.)
   - One idea per paragraph.

4. **Develop a natural, recognizable voice.** Conversational, not lecture-hall.
   Use "you" and "your." The moment it sounds "professional" it gets boring.
   Bad: "Successful people always prioritize their tasks." Good: "You need to
   stop doing everything — focus on the 3 things that actually move the needle."

5. **Show, don't just tell.** Follow each claim with evidence — a stat, a
   personal story, a before/after, a concrete example. Suggest embedding the
   user's own X posts/Articles as living examples where it fits.

6. **Edit ruthlessly.** The first draft is for you; the next is for the reader.
   - Cut **20–30%** of the word count.
   - Remove filler: "very," "really," "in order to," and similar.
   - Read the whole thing out loud (or simulate it) — awkward sentences jump
     out. If the project has the `/orc-use-audio` skill installed, you can
     literally have it read a paragraph back to catch clunky phrasing.

7. **Add visuals and formatting.** Suggest images, screenshots, charts, or
   embedded posts to break up text. Well-formatted articles get more
   engagement.

8. **End with a strong close.** Don't fade out. Summarize the key points, ask a
   question to spark replies, or give a clear call to action / one tip to try
   right now.

# Grounding the content

- If the article is about work in *this* project, **read the actual source**
  before writing — don't describe code from memory. Pull the real file names,
  flags, model ids, numbers, and limitations from the repo so every claim is
  true. Inflated or invented specifics are worse than omission.
- If the user references something they "saved" or "bookmarked," invoke
  `/orc-recall` first to ground the piece in their Knowledge base captures.
- Distinguish what the thing *does* from what it *doesn't do yet* — honest
  limitations read as credible and invite good replies.

# Output

- Write the article to `docs/articles/<kebab-slug>.md` (create the dir if
  missing) unless the user specifies another path.
- Start the file with the H1 title, then the top-of-file formatting note
  (code-blocks-don't-render + header-image suggestion), then the body.
- Do **not** commit unless the user asks — they'll usually paste it into the X
  composer and tweak. After writing, give a 2–3 line summary: the angle you
  took, how you handled any code, and the header-image suggestion. Note the
  Premium-eligibility requirement if you haven't already.

# Writing directly into the X Article composer (browser)

If the user gives you a composer URL (`https://x.com/compose/articles/edit/<id>`)
or asks you to "write it in X," drive the live editor with the
`mcp__claude-in-chrome__*` tools. This is **publishing-adjacent**: the composer
autosaves a draft on the user's real account. You MAY type the title and body
and apply formatting. You must NOT click **Publish**, change the audience, or
accept any dialog — publishing stays the user's action. Say so before you start.

This is the workflow that actually works (learned the hard way — follow it):

1. **Load Chrome tools first.** They're deferred: `ToolSearch` for
   `select:mcp__claude-in-chrome__tabs_context_mcp,...computer,...navigate` etc.
   before calling them.
2. **`tabs_context_mcp`** to see the group, then **`tabs_create_mcp`** for a
   fresh tab (don't reuse the user's tabs), then **`navigate`** to the composer
   URL. The first navigate sometimes bounces to `chrome://newtab`; just navigate
   again. Screenshot to confirm you're logged in and the editor rendered (it
   loads behind a spinner — `wait` 2s and re-screenshot if blank).
3. **Title:** `computer` `left_click` the "Add a title" field, then `type`.
4. **Body — type it ALL as plain paragraphs first.** Click the "Start writing"
   area and `type` the whole body, one `\n` between paragraphs (single newline =
   new paragraph in this editor). Type headings and the command lines as normal
   text for now; format them afterward. Type in a few large chunks, not
   character-poking.
5. **THE PITFALL: the body field can inherit "Heading" style**, so everything
   you type comes out heading-sized. After typing, if the whole body looks
   huge: click into the body, `cmd+a` to select all body text, open the style
   dropdown (the "Heading" button in the toolbar, ~x=882 y=43), and pick
   **Body**. Now everything is normal paragraph text.
6. **Apply headings, top to bottom.** For each section title: `triple_click`
   the line to select it, click the style dropdown, click **Heading** (or
   **Subheading** for a sub-level). The toolbar dropdown shows the four styles:
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

# What this skill is NOT

- Not a thread writer. Threads are numbered short posts; this is one long piece.
- Not a publisher. You write the markdown; the user publishes via the X Articles
  composer. You cannot post on their behalf.
