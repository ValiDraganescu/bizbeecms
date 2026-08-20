// Locks the design-system library pipeline: the committed generated module must
// match what scripts/generate-design-systems.mjs produces from the DESIGN.md
// files (drift = someone edited one side only), and every entry must carry the
// fields the list/get tools serve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry, renderModule, parseFrontmatter } from "./generate-design-systems.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("generated module is in sync with design-systems/*/DESIGN.md", () => {
  const expected = renderModule(buildRegistry(join(ROOT, "design-systems")));
  const committed = readFileSync(
    join(ROOT, "src", "lib", "chat", "design-systems.generated.ts"),
    "utf8",
  );
  assert.equal(
    committed,
    expected,
    "design-systems.generated.ts is stale — run: node scripts/generate-design-systems.mjs",
  );
});

test("every design system has slug, name, description and full DESIGN.md content", () => {
  const systems = buildRegistry(join(ROOT, "design-systems"));
  assert.ok(systems.length >= 1);
  for (const s of systems) {
    assert.match(s.slug, /^[a-z0-9-]+$/);
    assert.ok(s.name.length > 0);
    assert.ok(s.description.length > 20, `${s.slug}: description too thin to route on`);
    assert.ok(s.content.startsWith("---\n"), `${s.slug}: content must start with YAML frontmatter`);
    assert.ok(s.content.includes("\ncolors:"), `${s.slug}: frontmatter must define colors`);
  }
});

test("frontmatter parser handles inline and block-scalar descriptions", () => {
  assert.deepEqual(parseFrontmatter("---\nname: X\ndescription: one line\n---\nbody"), {
    name: "X",
    description: "one line",
  });
  const block = "---\nname: X\ndescription: >-\n  folded\n  lines\ncolors:\n  primary: \"#fff\"\n---\n";
  assert.deepEqual(parseFrontmatter(block), { name: "X", description: "folded lines" });
});
