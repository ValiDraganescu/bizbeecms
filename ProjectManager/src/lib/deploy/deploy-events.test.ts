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
  listDeployEventsForSite,
  collapseDeployEvents,
  selectLatestRun,
  type TimelineRow,
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
      deployId: "run-abc",
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
  assert.ok(params.includes("run-abc")); // deployId binds to the deploy_id column
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
      deployId: null,
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

/** Fake D1 whose `all()` returns seeded rows, so the read query's mapping is testable. */
function fakeD1Rows(rows: Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    prepare(sql: string) {
      const stmt: {
        sql: string;
        params: unknown[];
        bind: (...p: unknown[]) => unknown;
        all: () => Promise<unknown>;
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
          return { results: rows };
        },
        async raw() {
          calls.push({ sql: stmt.sql, params: stmt.params });
          return rows.map((r) => Object.values(r));
        },
      };
      return stmt;
    },
  };
}

test("listDeployEventsForSite filters by site and orders by started_at then created_at", async () => {
  const d1 = fakeD1Rows([]);
  const db = cfDb(d1 as unknown as D1Database);

  await listDeployEventsForSite("site-7", db);

  assert.equal(d1.calls.length, 1);
  const { sql, params } = d1.calls[0];
  // Reads the real table, scoped to the requested site, oldest-first for the timeline.
  assert.match(sql, /from "deploy_events"/i);
  assert.match(sql, /where "deploy_events"\."site_id" = \?/i);
  assert.match(sql, /order by "deploy_events"\."started_at" asc, "deploy_events"\."created_at" asc/i);
  assert.deepEqual(params, ["site-7"]);
});

test("listDeployEventsForSite maps D1 rows back through the real schema", async () => {
  // started_at/created_at are stored as ms-epoch ints; drizzle maps them to Date.
  const d1 = fakeD1Rows([
    {
      id: "e1",
      site_id: "site-7",
      deploy_id: "run-7",
      step: "build",
      status: "ok",
      started_at: 1_700_000_000_000,
      duration_ms: 4200,
      error: null,
      ram_available_mb: 512,
      created_at: 1_700_000_000_100,
    },
  ]);
  const db = cfDb(d1 as unknown as D1Database);

  const events = await listDeployEventsForSite("site-7", db);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, "e1");
  assert.equal(events[0].deployId, "run-7");
  assert.equal(events[0].step, "build");
  assert.equal(events[0].status, "ok");
  assert.equal(events[0].durationMs, 4200);
  assert.equal(events[0].ramAvailableMb, 512);
  assert.ok(events[0].startedAt instanceof Date);
  assert.equal(events[0].startedAt.getTime(), 1_700_000_000_000);
});

test("buildFailedCallbackEvent combines error + log tail into one terminal failed event", () => {
  const ev = buildFailedCallbackEvent("site-9", "wrangler deploy failed", "line1\nline2", 1_700_000_000_000, "run-9");
  assert.equal(ev.siteId, "site-9");
  assert.equal(ev.deployId, "run-9"); // the run id rides on the terminal callback event
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
  const ev = buildFailedCallbackEvent("site-9", undefined, undefined, 42, undefined);
  assert.equal(ev.error, "(no error)"); // no log tail appended when there's no log
  assert.equal(ev.deployId, null); // a missing deployId stays null
  const ev2 = buildFailedCallbackEvent("site-9", "boom", "", 42, "");
  assert.equal(ev2.error, "boom"); // empty log → not appended
  assert.equal(ev2.deployId, null); // a blank deployId stays null
});

test("a failed callback event persists into deploy_events via insertDeployEvent", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1 as unknown as D1Database);

  await insertDeployEvent(
    buildFailedCallbackEvent("site-9", "build OOM", "npm ERR! ...", 1_700_000_000_000, "run-9"),
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
    deployId: "run-42",
    step: "deploy",
    status: "failed",
    startedAt: "1700000000000", // string from a shell curl is coerced
    durationMs: "900",
    error: "boom",
    ramAvailableMb: "128",
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.event.deployId, "run-42");
    assert.equal(r.event.startedAt, 1_700_000_000_000);
    assert.equal(r.event.durationMs, 900);
    assert.equal(r.event.ramAvailableMb, 128);
    assert.equal(r.event.error, "boom");
    assert.equal(r.event.status, "failed");
  }

  // A body without a deployId (legacy deployer) parses with deployId: null.
  const noRun = parseDeployEvent({ siteId: "s", step: "x", status: "ok", startedAt: 1 });
  assert.ok(noRun.ok);
  if (noRun.ok) assert.equal(noRun.event.deployId, null);
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

const row = (o: Partial<TimelineRow> & { step: string; status: TimelineRow["status"] }): TimelineRow => ({
  id: `${o.step}-${o.status}`,
  deployId: "run-1",
  startedAt: "2026-06-18T10:00:00.000Z",
  durationMs: null,
  error: null,
  ramAvailableMb: null,
  ...o,
});

test("selectLatestRun keeps only the most-recently-started run's events", () => {
  // Two runs interleaved as the read API returns them (oldest-first). The newer
  // run (run-2, later startedAt) must be the only one shown — the bug repro.
  const kept = selectLatestRun([
    row({ id: "a", deployId: "run-1", step: "build", status: "failed", startedAt: "2026-06-18T10:00:00.000Z" }),
    row({ id: "b", deployId: "run-1", step: "callback", status: "failed", startedAt: "2026-06-18T10:01:00.000Z" }),
    row({ id: "c", deployId: "run-2", step: "clone", status: "started", startedAt: "2026-06-18T10:05:00.000Z" }),
    row({ id: "d", deployId: "run-2", step: "build", status: "started", startedAt: "2026-06-18T10:06:00.000Z" }),
  ]);
  assert.deepEqual(kept.map((r) => r.id), ["c", "d"]);
  assert.ok(kept.every((r) => r.deployId === "run-2"));
});

test("selectLatestRun preserves original order within the selected run", () => {
  const kept = selectLatestRun([
    row({ id: "x1", deployId: "run-2", step: "clone", status: "started", startedAt: "2026-06-18T10:05:00.000Z" }),
    row({ id: "old", deployId: "run-1", step: "build", status: "failed", startedAt: "2026-06-18T10:00:00.000Z" }),
    row({ id: "x2", deployId: "run-2", step: "clone", status: "ok", startedAt: "2026-06-18T10:05:30.000Z" }),
  ]);
  assert.deepEqual(kept.map((r) => r.id), ["x1", "x2"]);
});

test("selectLatestRun groups legacy null-deployId rows as one run", () => {
  const kept = selectLatestRun([
    row({ id: "n1", deployId: null, step: "clone", status: "started", startedAt: "2026-06-18T09:00:00.000Z" }),
    row({ id: "n2", deployId: null, step: "build", status: "ok", startedAt: "2026-06-18T09:01:00.000Z" }),
  ]);
  assert.deepEqual(kept.map((r) => r.id), ["n1", "n2"]);
});

test("selectLatestRun returns [] for no events", () => {
  assert.deepEqual(selectLatestRun([]), []);
});

test("collapseDeployEvents folds each step's started+ok pair into one finished row", () => {
  const rows = collapseDeployEvents([
    row({ step: "clone", status: "started" }),
    row({ step: "clone", status: "ok", durationMs: 1200 }),
    row({ step: "build", status: "started" }),
    row({ step: "build", status: "ok", durationMs: 4200 }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.step), ["clone", "build"]);
  assert.deepEqual(rows.map((r) => r.status), ["ok", "ok"]);
  assert.equal(rows[0].durationMs, 1200);
  assert.equal(rows[1].durationMs, 4200);
});

test("collapseDeployEvents leaves an in-flight step (started only) as Running", () => {
  const rows = collapseDeployEvents([
    row({ step: "clone", status: "started" }),
    row({ step: "clone", status: "ok", durationMs: 1200 }),
    row({ step: "build", status: "started" }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].step, "build");
  assert.equal(rows[1].status, "started");
  assert.equal(rows[1].durationMs, null);
});

test("collapseDeployEvents keeps the failed status + error on the collapsed row", () => {
  const rows = collapseDeployEvents([
    row({ step: "build", status: "started", startedAt: "2026-06-18T10:00:00.000Z" }),
    row({ step: "build", status: "failed", error: "OOM killed", durationMs: 5000 }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].error, "OOM killed");
  assert.equal(rows[0].durationMs, 5000);
});

test("collapseDeployEvents preserves first-seen startedAt, id, and ram from the started row", () => {
  const rows = collapseDeployEvents([
    row({ id: "first", step: "build", status: "started", startedAt: "2026-06-18T10:00:00.000Z", ramAvailableMb: 900 }),
    row({ id: "second", step: "build", status: "ok", startedAt: "2026-06-18T10:05:00.000Z", durationMs: 4200 }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "first");
  assert.equal(rows[0].startedAt, "2026-06-18T10:00:00.000Z");
  assert.equal(rows[0].ramAvailableMb, 900);
});
