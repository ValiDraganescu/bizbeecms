# ADR format — reference for `/orc-grill`

An ADR records **that** a decision was made and **why**. It is a note to the next engineer so they don't relitigate settled ground or "fix" something that was deliberate.

## The three-question test (load-bearing)

Only create an ADR when **all three** are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful (schema, wire format, integration pattern, technology with lock-in).
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons.

If any of the three is missing, **do not** create an ADR. Easy-to-reverse decisions will just be reversed. Unsurprising decisions don't need a record. "We did the obvious thing" is not an ADR.

## What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library — just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it — otherwise someone will suggest GraphQL again in six months.

## Location

- **Single-context repo**: `<projectRoot>/docs/adr/`.
- **Multi-context repo**: system-wide decisions at `<projectRoot>/docs/adr/`; context-specific decisions at `<context-folder>/docs/adr/`. When in doubt, ask the user which scope the decision belongs to.

Create the directory lazily — only when the first ADR is needed.

## Numbering

Scan the relevant `docs/adr/` for the highest existing number and increment by one. ADRs use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc. Zero-pad to four digits.

## Template

The value of an ADR is in recording *that* a decision was made and *why* — not in filling out sections. Most ADRs are a single paragraph.

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's the whole template.

## Optional sections (only when they add value)

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — useful when decisions are revisited.
- **Considered Options** — only when the rejected alternatives are worth remembering.
- **Consequences** — only when non-obvious downstream effects need to be called out.

If you're tempted to add headings just to fill space, don't.
