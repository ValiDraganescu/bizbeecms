/**
 * MANUAL live check (not in the suite): the "Context attached" chip appears in
 * the chat on /admin/data-sources, backed by the data-sources inline context.
 *
 * Drives a fresh headless Chrome over raw CDP (node >=22 built-in WebSocket):
 * navigate → wait for hydration + the publisher effect's request fetches →
 * click the chat bubble → expand the chip → assert the context text names a
 * live source and NEVER leaks secret-ish fields.
 *
 * Usage: node scripts/live-ds-context-chip-check.mjs [url]
 * Requires the dev server on :3602 (CMS_DEV_SUPERADMIN auto-auth).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const URL_TO_CHECK = process.argv[2] ?? "http://localhost:3602/admin/data-sources";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "ds-chip-check-"));

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstPageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      /* chrome not up yet */
    }
    await sleep(300);
  }
  throw new Error("Chrome debug endpoint never came up");
}

let msgId = 0;
function send(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) {
        ws.removeEventListener("message", onMsg);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const evalJs = async (ws, expression) =>
  (await send(ws, "Runtime.evaluate", { expression, returnByValue: true })).result.value;

try {
  const target = await firstPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  await send(ws, "Page.enable");
  await send(ws, "Page.navigate", { url: URL_TO_CHECK });
  await sleep(5000); // hydration + the publisher effect's per-source request fetches

  // 1. The chat bubble exists — click it to open the panel.
  const opened = await evalJs(
    ws,
    `(() => { const b = document.querySelector('button.fixed.bottom-6.right-6'); if (!b) return false; b.click(); return true; })()`,
  );
  assert.equal(opened, true, "chat bubble button not found on /admin/data-sources");
  await sleep(1500);

  // 2. The "Context attached" chip is rendered (it returns null when no context).
  const chipHtml = await evalJs(
    ws,
    `(() => { const els = [...document.querySelectorAll('button[aria-expanded]')]; const chip = els.find((e) => e.textContent.includes('Context attached')); if (!chip) return null; chip.click(); return true; })()`,
  );
  assert.equal(chipHtml, true, 'no "Context attached" chip in the open chat panel');
  await sleep(300);

  // 3. Expanded chip shows the data-sources context: names a live source,
  //    never leaks secret-ish fields.
  const text = await evalJs(ws, "document.body.innerText");
  assert.match(text, /\[Data sources context\]/);
  assert.match(text, /httpbingo fixture/); // a live fixture source is named
  assert.match(text, /auth: /);
  assert.doesNotMatch(text, /secretEnc|hasSecret|client_secret/);

  console.log("LIVE CHECK GREEN: Context attached chip on /admin/data-sources shows the data-sources context.");
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
