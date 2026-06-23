/**
 * Dep-free in-memory fake D1, friendly to `node --test` (native TS stripping).
 *
 * It implements just enough of the D1 prepared-statement surface that the REAL
 * drizzle-D1 client (`drizzle(d1, { schema })`) drives over it — so tests run
 * the real schema → real SQL → real bindings, not a mock of our own code.
 *
 * Two flavours:
 *  - `fakeD1()`        — records every prepared SQL + bound params; reads return
 *                        empty. Use it to assert the SQL/params a write emits.
 *  - `fakeD1Rows(rows)`— same recording, but reads (`all`/`raw`) return seeded
 *                        rows so the read mapping back through the schema is
 *                        testable.
 *
 * Both expose `.calls` ({ sql, params }[]) in call order.
 *
 * ponytail: minimal D1 surface (prepare/bind/all/run/first/raw). `run()` reports
 * zero rows-affected; if a test needs RETURNING semantics across statements, pass
 * a row-returning fake (see `fakeD1Returning`).
 */

export type D1Call = { sql: string; params: unknown[] };

type AnyD1 = { calls: D1Call[]; prepare: (sql: string) => unknown };

/** Records every prepared SQL + bound params; reads return empty results. */
export function fakeD1(): AnyD1 {
  const calls: D1Call[] = [];
  return {
    calls,
    prepare(sql: string) {
      const stmt: Record<string, unknown> = {
        sql,
        params: [] as unknown[],
        bind(...p: unknown[]) {
          stmt.params = p;
          return stmt;
        },
        async all() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return { results: [] };
        },
        async run() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return { results: [], meta: {} };
        },
        async first() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return null;
        },
        async raw() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return [];
        },
      };
      return stmt;
    },
  };
}

/** Like `fakeD1`, but `all()`/`raw()` return the seeded rows (read mapping). */
export function fakeD1Rows(rows: Record<string, unknown>[]): AnyD1 {
  const calls: D1Call[] = [];
  return {
    calls,
    prepare(sql: string) {
      const stmt: Record<string, unknown> = {
        sql,
        params: [] as unknown[],
        bind(...p: unknown[]) {
          stmt.params = p;
          return stmt;
        },
        async all() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return { results: rows };
        },
        async run() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return { results: rows, meta: {} };
        },
        async first() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return rows[0] ?? null;
        },
        async raw() {
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return rows.map((r) => Object.values(r));
        },
      };
      return stmt;
    },
  };
}

/**
 * Fake D1 that returns a fresh batch of rows per statement, matched by a SQL
 * substring. Lets one test exercise a multi-statement flow (e.g. select reset,
 * then a guarded `update … returning`) where each statement needs its own
 * result. `match` is checked in order; the first hit supplies that call's rows.
 * Unmatched statements return `[]`. Pass `once: true` to consume a matcher after
 * its first hit (so a repeated statement can return rows then empty — models a
 * single-use `update … where usedAt is null returning`).
 */
export function fakeD1Returning(
  matchers: { match: string; rows: Record<string, unknown>[]; once?: boolean }[],
): AnyD1 {
  const calls: D1Call[] = [];
  const spent = new Set<number>();
  const rowsFor = (sql: string): Record<string, unknown>[] => {
    for (let i = 0; i < matchers.length; i++) {
      if (spent.has(i)) continue;
      if (sql.includes(matchers[i].match)) {
        if (matchers[i].once) spent.add(i);
        return matchers[i].rows;
      }
    }
    return [];
  };
  return {
    calls,
    prepare(sql: string) {
      const stmt: Record<string, unknown> = {
        sql,
        params: [] as unknown[],
        bind(...p: unknown[]) {
          stmt.params = p;
          return stmt;
        },
        async all() {
          const rows = rowsFor(stmt.sql as string);
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return { results: rows };
        },
        async run() {
          const rows = rowsFor(stmt.sql as string);
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return { results: rows, meta: {} };
        },
        async first() {
          const rows = rowsFor(stmt.sql as string);
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return rows[0] ?? null;
        },
        async raw() {
          const rows = rowsFor(stmt.sql as string);
          calls.push({ sql: stmt.sql as string, params: stmt.params as unknown[] });
          return rows.map((r) => Object.values(r));
        },
      };
      return stmt;
    },
  };
}
