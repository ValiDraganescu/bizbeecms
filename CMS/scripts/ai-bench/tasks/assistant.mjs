/**
 * Purpose `assistant` — the CMS AI builder. Uses the REAL system prompt
 * (`buildSystemPrompt` + `contextPrompt`), the REAL tool schemas and the REAL
 * validators (`validateComponentArtifact`, `validateBlocks`, `validateEditText`),
 * with a fixture Site (identity, components, page, locales) and mocked READ
 * tools so the model can run its usual read → write loop. Write tools are
 * recorded, not executed — scoring inspects them.
 */
import { buildSystemPrompt } from "../../../src/lib/settings/site-settings.ts";
import { contextPrompt } from "../../../src/lib/chat/tool-scopes.ts";
import { CREATE_COMPONENT_TOOL, validateComponentArtifact } from "../../../src/lib/chat/component-tool.ts";
import { UPDATE_COMPONENT_TOOL, UPDATE_PAGE_BLOCKS_TOOL, SET_BLOCK_PROPS_TOOL, builtinBlockTypes } from "../../../src/lib/chat/write-tools.ts";
import { LIST_COMPONENTS_TOOL, GET_COMPONENT_TOOL, GET_PAGE_TOOL, LIST_LOCALES_TOOL, SEARCH_ICONS_TOOL, GET_THEME_TOOL } from "../../../src/lib/chat/read-tools.ts";
import { EDIT_TEXT_TOOL, validateEditText } from "../../../src/lib/chat/edit-text-tool.ts";
import { validateBlocks } from "../../../src/lib/pages/page-blocks.ts";
import { runToolLoop } from "../openrouter.mjs";
import { check, judgeCheck } from "./shared.mjs";

const LOCALES = ["en", "fi", "et"];

const IDENTITY = {
  brandName: "Restovista",
  tagline: "Modern Nordic dining in the heart of Tallinn",
  voice: "warm, confident, plain language",
  design: "minimal, generous whitespace, rounded cards, photography-led",
  aiPersona: "Prefer short sections and accessible contrast.",
};

const COMPONENTS = [
  { name: "Hero", props: [
    { name: "title", type: "string", required: true, translatable: true },
    { name: "subtitle", type: "string", translatable: true },
    { name: "ctaLabel", type: "string", translatable: true },
    { name: "ctaHref", type: "link" },
    { name: "image", type: "image" },
  ] },
  { name: "MenuItemCard", props: [
    { name: "name", type: "string", required: true, translatable: true },
    { name: "description", type: "richtext", translatable: true },
    { name: "price", type: "string", required: true },
    { name: "image", type: "image" },
  ] },
  { name: "Footer", props: [{ name: "copyright", type: "string", translatable: true }] },
];

const HERO_HTML = `<section class="relative overflow-hidden rounded-2xl bg-foreground text-surface">
  <img src="{{image}}" alt="" class="absolute inset-0 h-full w-full object-cover opacity-60" />
  <div class="relative mx-auto max-w-4xl px-6 py-24 text-center">
    <h1 class="font-heading text-5xl">{{t title}}</h1>
    <p class="mt-4 text-lg text-surface/80">{{t subtitle}}</p>
    <a href="{{ctaHref}}" class="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-primary-foreground hover:bg-primary-hover">{{t ctaLabel}}</a>
  </div>
</section>`;

const HERO_ARTIFACT = {
  name: "Hero",
  html: HERO_HTML,
  script: "",
  css: "",
  propsSchema: {
    title: { type: "string", translatable: true, default: { en: "Taste the North", fi: "Maista pohjoista", et: "Maitse põhjamaid" } },
    subtitle: { type: "string", translatable: true, default: { en: "Seasonal menus, local producers.", fi: "Kausimenut, paikalliset tuottajat.", et: "Hooajamenüüd, kohalikud tootjad." } },
    ctaLabel: { type: "string", translatable: true, default: { en: "Book now", fi: "Varaa nyt", et: "Broneeri kohe" } },
    ctaHref: { type: "link", default: "/reserve" },
    image: { type: "image", default: "/media/hero.jpg" },
  },
};

const PAGE_ID = "page_home_01";
const PAGE = {
  id: PAGE_ID,
  title: "Home",
  slug: "/",
  blocks: [
    { id: "sec-hero", component: "Section", props: { name: "Hero" }, children: [
      { id: "row-hero", component: "__section_row__", props: { columns: 1 }, children: [
        { id: "col-hero", component: "__section_column__", children: [
          { id: "hero-1", component: "Hero", props: {} },
        ] },
      ] },
    ] },
    { id: "sec-footer", component: "Section", props: { name: "Footer" }, children: [
      { id: "row-footer", component: "__section_row__", props: { columns: 1 }, children: [
        { id: "col-footer", component: "__section_column__", children: [
          { id: "footer-1", component: "Footer", props: {} },
        ] },
      ] },
    ] },
  ],
};

const THEME = {
  ok: true,
  theme: { light: { surface: "oklch(0.99 0 0)", foreground: "oklch(0.2 0.02 260)", primary: "oklch(0.55 0.15 40)" }, dark: { surface: "oklch(0.18 0.02 260)", foreground: "oklch(0.97 0 0)", primary: "oklch(0.7 0.15 40)" } },
  overrides: { light: {}, dark: {} },
  fonts: { body: "Inter", heading: "Fraunces", accent: null },
};

const TOOLS = [
  LIST_COMPONENTS_TOOL, GET_COMPONENT_TOOL, GET_PAGE_TOOL, LIST_LOCALES_TOOL, SEARCH_ICONS_TOOL, GET_THEME_TOOL,
  CREATE_COMPONENT_TOOL, UPDATE_COMPONENT_TOOL, UPDATE_PAGE_BLOCKS_TOOL, SET_BLOCK_PROPS_TOOL, EDIT_TEXT_TOOL,
];
const TOOL_NAMES = TOOLS.map((t) => t.function.name);
const WRITE_TOOLS = new Set(["create_component", "update_component", "update_page_blocks", "set_block_props", "edit_text"]);

function systemPrompt(context) {
  return (
    buildSystemPrompt({ identity: IDENTITY, components: COMPONENTS, builtins: builtinBlockTypes(), collections: [], locales: LOCALES, tools: TOOL_NAMES }) +
    "\n\n" + contextPrompt(context)
  );
}

/** Mock READ tools; WRITE tools are acknowledged generically (recorded by the loop). */
function mockRunTool(name, args) {
  switch (name) {
    case "list_components": return { ok: true, components: COMPONENTS.map((c) => ({ name: c.name, props: c.props })) };
    case "get_component": return args?.name === "Hero" ? { ok: true, component: HERO_ARTIFACT } : { ok: false, errors: [`no component named "${args?.name}"`] };
    case "get_page": return args?.id === PAGE_ID ? { ok: true, page: { id: PAGE.id, title: PAGE.title, slug: PAGE.slug }, blocks: PAGE.blocks } : { ok: false, errors: [`no page with id "${args?.id}"`] };
    case "list_locales": return { ok: true, locales: LOCALES };
    case "search_icons": return { ok: true, icons: ["utensils", "star", "quote", "map-pin", "phone", "clock"] };
    case "get_theme": return THEME;
    case "create_component": return { ok: true, name: args?.name, message: "component created" };
    case "update_component": return { ok: true, name: args?.name, message: "component updated" };
    case "update_page_blocks": return { ok: true, id: args?.id, message: "page blocks updated" };
    case "set_block_props": return { ok: true };
    case "edit_text": return { ok: true, message: "text patched" };
    default: return { ok: false, errors: [`unknown tool ${name}`] };
  }
}

const RAW_COLOR_RE = /\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b|\[#[0-9a-fA-F]{3,8}\]/;

/** True when the reply claims Footer has an image prop (a line/sentence with Footer + image and no negation). */
function footerHasImage(text) {
  return text.split(/\n|(?<=[.!?])\s+/).some((seg) => /Footer/.test(seg) && /image/i.test(seg) && !/\b(no|not|n't|without|lacks?|none)\b/i.test(seg));
}

function writes(calls, name) {
  return calls.filter((c) => c.name === name);
}

async function runTask(ctx, context, userText, scorer) {
  const messages = [{ role: "system", content: systemPrompt(context) }, { role: "user", content: userText }];
  const out = await runToolLoop(ctx.apiKey, { model: ctx.model, messages, tools: TOOLS, maxTokens: 8000 }, mockRunTool, 4);
  const checks = await scorer(out);
  // Universal discipline: no code fences pasted into the chat reply.
  checks.push(check("no code pasted in reply", !/```/.test(out.finalText), 1));
  return { checks, usage: out.usage, latencyMs: out.latencyMs, transcript: { calls: out.calls.map((c) => ({ name: c.name, args: c.args })), finalText: out.finalText } };
}

export const tasks = [
  {
    id: "create-testimonial-component",
    run: (ctx) => runTask(ctx, "components",
      "Create a Testimonial component: a customer quote, the customer's name and their role/city, and a small round avatar photo. Text must be translatable. Then tell me in one line what you made.",
      async (out) => {
        const cc = writes(out.calls, "create_component");
        const args = cc[0]?.args;
        const checks = [check("called create_component", cc.length >= 1, 3)];
        if (!args) return checks;
        const v = validateComponentArtifact(args);
        checks.push(check("artifact passes validateComponentArtifact", v.ok, 4, v.ok ? "" : v.errors.join("; ")));
        const html = String(args.html ?? "");
        checks.push(check("uses translatable slots {{t …}}", /\{\{t\s+\w+\}\}/.test(html), 2));
        const schema = args.propsSchema && typeof args.propsSchema === "object" ? args.propsSchema : {};
        const tSlots = [...new Set([...html.matchAll(/\{\{t\s+(\w+)\}\}/g)].map((m) => m[1]))];
        const tProps = tSlots.map((k) => schema[k]).filter(Boolean);
        const allLocales = tSlots.length > 0 && tProps.length === tSlots.length && tProps.every((p) => p.default && typeof p.default === "object" && LOCALES.every((l) => typeof p.default[l] === "string" && p.default[l].trim()));
        checks.push(check("{{t}} slot defaults filled for en/fi/et", allLocales, 3, `slots=${tSlots.join(",")}`));
        checks.push(check("{{t}} slots declared translatable:true", tSlots.length > 0 && tProps.length === tSlots.length && tProps.every((p) => p.translatable === true), 1));
        checks.push(check("has an image prop for the avatar", Object.values(schema).some((p) => p && p.type === "image"), 1));
        checks.push(check("theme tokens only (no raw palette/hex)", !RAW_COLOR_RE.test(html), 3, RAW_COLOR_RE.exec(html)?.[0]));
        checks.push(check("no React-isms (className/onClick)", !/\bclassName=|\bonClick=/.test(html), 1));
        return checks;
      }),
  },
  {
    id: "add-menu-section-to-page",
    run: (ctx) => runTask(ctx, "page-builder",
      `On the Home page (id ${PAGE_ID}), add a "Featured dishes" section between the hero and the footer: one row with 3 columns, each column holding a MenuItemCard with realistic Nordic dishes and prices in euros. Keep everything else as it is.`,
      async (out) => {
        const up = writes(out.calls, "update_page_blocks");
        const args = up.at(-1)?.args;
        const checks = [check("called update_page_blocks", up.length >= 1, 3)];
        checks.push(check("read the page first (get_page)", out.calls.some((c) => c.name === "get_page" && c.round === 0), 1));
        if (!args) return checks;
        checks.push(check("targets the right page id", args.id === PAGE_ID, 1));
        const v = validateBlocks(args.blocks);
        checks.push(check("blocks pass validateBlocks", v.ok, 4, v.ok ? "" : v.errors.join("; ")));
        if (!v.ok) return checks;
        const top = v.blocks;
        const names = top.map((b) => b.props?.name);
        checks.push(check("hero kept as first section", top[0]?.id === "sec-hero", 2));
        checks.push(check("footer kept as last section", top.at(-1)?.id === "sec-footer", 2));
        const featured = top.find((b, i) => i > 0 && i < top.length - 1 && /featured/i.test(String(b.props?.name ?? "")));
        checks.push(check("new section named 'Featured dishes' in the middle", !!featured, 2, `sections: ${names.join(" | ")}`));
        if (featured) {
          const row = (featured.children ?? []).find((c) => c.component === "__section_row__");
          const cols = (row?.children ?? []).filter((c) => c.component === "__section_column__");
          checks.push(check("row has 3 columns", row?.props?.columns === 3 && cols.length === 3, 2, `columns=${row?.props?.columns} cols=${cols.length}`));
          const cards = cols.flatMap((c) => (c.children ?? []).filter((x) => x.component === "MenuItemCard"));
          checks.push(check("3 MenuItemCards", cards.length === 3, 2));
          checks.push(check("cards have name+price props", cards.length > 0 && cards.every((c) => c.props && c.props.name && /\d/.test(String(c.props.price ?? ""))), 2));
          const i18n = cards.length > 0 && cards.every((c) => { const n = c.props?.name; return n && typeof n === "object" && LOCALES.every((l) => n[l]); });
          checks.push(check("card names given in all locales", i18n, 2));
        }
        return checks;
      }),
  },
  {
    id: "edit-hero-cta-class",
    run: (ctx) => runTask(ctx, "components",
      "In the Hero component, the CTA button is fully rounded (rounded-full). Make it a softer rounded rectangle instead (rounded-lg). Change nothing else. Use the cheapest correct tool.",
      async (out) => {
        const et = writes(out.calls, "edit_text");
        const uc = writes(out.calls, "update_component");
        const checks = [
          check("read the component first (get_component)", out.calls.some((c) => c.name === "get_component"), 1),
          check("used edit_text (not a full update_component rewrite)", et.length >= 1 && uc.length === 0, 4, `edit_text=${et.length} update_component=${uc.length}`),
        ];
        const args = et[0]?.args;
        if (args) {
          const v = validateEditText(args);
          checks.push(check("edit_text args validate", !("error" in v), 2, v.error));
          checks.push(check("targets component.html of Hero", args.target === "component.html" && args.name === "Hero", 1));
          const old = String(args.oldString ?? "") + String(args.start ?? "");
          checks.push(check("old snippet exists in the html", old.length > 0 && HERO_HTML.includes(String(args.oldString ?? args.start ?? "")), 2, old.slice(0, 80)));
          checks.push(check("old snippet mentions rounded-full", /rounded-full/.test(old), 1));
          checks.push(check("new text uses rounded-lg", /rounded-lg/.test(String(args.newString ?? "")) && !/rounded-full/.test(String(args.newString ?? "")), 2));
        } else if (uc[0]?.args) {
          const html = String(uc[0].args.html ?? "");
          checks.push(check("(fallback) update_component result correct", /rounded-lg/.test(html) && !/rounded-full/.test(html) && /\{\{t title\}\}/.test(html), 2));
        }
        return checks;
      }),
  },
  {
    id: "answer-question-no-writes",
    run: (ctx) => runTask(ctx, "general",
      "Which components does this site have, and which of them have an image prop? Just answer, don't change anything.",
      async (out) => {
        const wroteSomething = out.calls.some((c) => WRITE_TOOLS.has(c.name));
        const t = out.finalText;
        return [
          check("no write tools called", !wroteSomething, 3),
          check("mentions Hero, MenuItemCard, Footer", /Hero/.test(t) && /MenuItemCard/.test(t) && /Footer/.test(t), 2),
          check("identifies Hero + MenuItemCard as image-bearing, not Footer", /Hero/.test(t) && /MenuItemCard/.test(t) && !footerHasImage(t), 2),
          check("concise (< 900 chars)", t.length > 0 && t.length < 900, 1),
        ];
      }),
  },
];

export const purpose = "assistant";
export const modelKind = "text-tools";
