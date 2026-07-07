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

Code handling: markdown fenced blocks pasted as *text* won't auto-convert — a
real code block comes from choosing Insert → Code and pasting into it. For the
common case of one or two short commands, plain indented lines (a `>` blockquote
in the source md) read fine and are less fuss; reserve the real Code block for a
genuine multi-line listing.

In the source markdown file, write commands as indented blockquote lines (not
fenced ```), and note at the top how you handled any code, so the md stays clean
and the human knows whether to use Insert → Code in the composer. Write the
whole file so a copy-paste into the X composer needs minimal cleanup.

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
  (how any code was handled + the header-image suggestion), then the body.
- Do **not** commit unless the user asks — they'll usually paste it into the X
  composer and tweak. After writing, give a 2–3 line summary: the angle you
  took, how you handled any code, and the header-image suggestion. Note the
  Premium-eligibility requirement if you haven't already.

# Writing directly into the X Article composer (browser)

If the user gives you a composer URL (`https://x.com/compose/articles/edit/<id>`)
or asks you to "write it in X," follow the step-by-step browser workflow in
[`COMPOSER.md`](./COMPOSER.md). One boundary applies throughout: you type and
format the draft (the composer autosaves on the user's real account), and
**publishing stays the user's action** — say so before you start.
