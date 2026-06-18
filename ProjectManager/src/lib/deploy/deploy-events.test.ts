import assert from "node:assert/strict";
import { test } from "node:test";

// Dep-free node --test. The lib imports the real schema/Db via relative .ts so
// type-stripping resolves it; `insertDeployEvent` takes an injected Db, so we
// drive the REAL drizzle client over an in-memory fake D1 and assert the SQL +
// bound params it emits against the real `deploy_events` schema — that's the
// seam earning its keep (real schema → real SQL → real binding), not a mock.
import { drizzle } from "drizzle-orm/d1";
import {
  isAuthorized,
  parseDeployEvent,
  insertDeployEvent,
  buildFailedCallbackEvent,
} from "./deploy-events.ts";
import * as schema from "../../db/schema.ts";

/** Build the real schema-bound drizzle-D1 client over a fake D1, like prod's getDb. */
const cfDb = (d1: D1Database) => drizzle(d1, { schema });

/** In-memory fake D1Database: records every prepared SQL + bound params. */
function fakeD1() {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    prepare(sql: string) {
      const stmt: {
        sql: string;
        params: unknown[];
        bind: (...p: unknown[]) => unknown;
        all: () => Promise<unknown>;
        run: () => Promise<unknown>;
        first: () => Promise<unknown>;
        raw: () => Promise<unknown>;
      } = {
        sql,
        params: [],
        bind(...p: unknown[]) {
          stmt.params = p;
          return stmt;
        },
        async all() {
          calls.push({ sql: stmt.sql, params: stmt.params });
          return { results: [] };
        },
        async run() {
          calls.push({ sql: stmt.sql, params: stmt.params });
          return { results: [], meta: {} };
        },
        async first() {
          calls.push({ sql: stmt.sql, params: stmt.params });
          return null;
        },
        async raw() {
          calls.push({ sql: stmt.sql, params: stmt.params });
          return [];
        },
      };
      return stmt;
    },
  };
}

test("insertDeployEvent compiles a real insert into deploy_events with bound values", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1 as unknown as D1Database);

  await insertDeployEvent(
    {
      siteId: "site-1",
      step: "build",
      status: "ok",
      startedAt: 1_700_000_000_000,
      durationMs: 4200,
      error: null,
      ramAvailableMb: 512,
    },
    db,
  );

  assert.equal(d1.calls.length, 1);
  const { sql, params } = d1.calls[0];
  // Hits the real "deploy_events" table (proves the schema is bound).
  assert.match(sql, /insert into "deploy_events"/i);
  // Real column values flow through as bound params.
  assert.ok(params.includes("site-1"));
  assert.ok(params.includes("build"));
  assert.ok(params.includes("ok"));
  assert.ok(params.includes(1_700_000_000_000)); // startedAt as ms epoch
  assert.ok(params.includes(4200)); // durationMs
  assert.ok(params.includes(512)); // ramAvailableMb
});

test("insertDeployEvent persists nullable fields as null, not undefined", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1 as unknown as D1Database);

  await insertDeployEvent(
    {
      siteId: "site-2",
      step: "clone",
      status: "started",
      startedAt: 1_700_000_000_000,
      durationMs: null,
      error: null,
      ramAvailableMb: null,
    },
    db,
  );

  const { params } = d1.calls[0];
  // The three nullable columns bind to null (D1 stores NULL), never undefined.
  assert.ok(params.includes(null));
  assert.ok(!params.includes(undefined));
});

test("buildFailedCallbackEvent combines error + log tail into one terminal failed event", () => {
  const ev = buildFailedCallbackEvent("site-9", "wrangler deploy failed", "line1\nline2", 1_700_000_000_000);
  assert.equal(ev.siteId, "site-9");
  assert.equal(ev.step, "callback");
  assert.equal(ev.status, "failed");
  assert.equal(ev.startedAt, 1_700_000_000_000);
  assert.equal(ev.durationMs, null);
  assert.equal(ev.ramAvailableMb, null);
  // Both the reported error and the log tail are preserved in the error field.
  assert.ok(ev.error && ev.error.includes("wrangler deploy failed"));
  assert.ok(ev.error && ev.error.includes("line1\nline2"));
});

test("buildFailedCallbackEvent tolerates a missing error and missing log", () => {
  const ev = buildFailedCallbackEvent("site-9", undefined, undefined, 42);
  assert.equal(ev.error, "(no error)"); // no log tail appended when there's no log
  const ev2 = buildFailedCallbackEvent("site-9", "boom", "", 42);
  assert.equal(ev2.error, "boom"); // empty log → not appended
});

test("a failed callback event persists into deploy_events via insertDeployEvent", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1 as unknown as D1Database);

  await insertDeployEvent(
    buildFailedCallbackEvent("site-9", "build OOM", "npm ERR! ...", 1_700_000_000_000),
    db,
  );

  assert.equal(d1.calls.length, 1);
  const { sql, params } = d1.calls[0];
  assert.match(sql, /insert into "deploy_events"/i);
  assert.ok(params.includes("site-9"));
  assert.ok(params.includes("callback"));
  assert.ok(params.includes("failed"));
  // The combined error text (reported error + log tail) is bound, not dropped.
  assert.ok(params.some((p) => typeof p === "string" && p.includes("build OOM") && p.includes("npm ERR!")));
});

test("parseDeployEvent accepts a valid body and coerces numerics", () => {
  const r = parseDeployEvent({
    siteId: "s",
    step: "deploy",
    status: "failed",
    startedAt: "1700000000000", // string from a shell curl is coerced
    durationMs: "900",
    error: "boom",
    ramAvailableMb: "128",
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.event.startedAt, 1_700_000_000_000);
    assert.equal(r.event.durationMs, 900);
    assert.equal(r.event.ramAvailableMb, 128);
    assert.equal(r.event.error, "boom");
    assert.equal(r.event.status, "failed");
  }
});

test("parseDeployEvent rejects missing siteId, bad status, and missing startedAt", () => {
  assert.equal(parseDeployEvent({ step: "x", status: "ok", startedAt: 1 }).ok, false);
  assert.equal(parseDeployEvent({ siteId: "s", step: "x", status: "running", startedAt: 1 }).ok, false);
  assert.equal(parseDeployEvent({ siteId: "s", step: "x", status: "ok" }).ok, false);
  assert.equal(parseDeployEvent("not an object").ok, false);
});

test("isAuthorized: matches only a non-empty secret equal to the bearer token", () => {
  assert.equal(isAuthorized("s3cret", "s3cret"), true);
  // wrong token rejected
  assert.equal(isAuthorized("s3cret", "nope"), false);
  // missing/blank secret never authorizes (even if bearer is blank too)
  assert.equal(isAuthorized("", ""), false);
  assert.equal(isAuthorized(undefined, ""), false);
  assert.equal(isAuthorized(undefined, "anything"), false);
});
