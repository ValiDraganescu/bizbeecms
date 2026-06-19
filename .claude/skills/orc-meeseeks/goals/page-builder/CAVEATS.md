# Caveats — page-builder
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The reference impl lives in a SEPARATE repo (`/Users/valentindraganescu/git/dev/aicms`,
  `src/modules/page-builder/components/page-builder-v2/`). Read it for the layout, but DO NOT copy its
  imports/deps blindly — adapt to this project's design system (purpose tokens, `src/components/ui`,
  next-intl EN/FI/ET) and CF-native constraints (no server actions — REST + fetch; see main CAVEATS).
- In the reference, the **Layers** panel is in the CENTER (toggled with Preview), and the LEFT rail is
  Components-only. Keep that arrangement — it matches the requested layout.
