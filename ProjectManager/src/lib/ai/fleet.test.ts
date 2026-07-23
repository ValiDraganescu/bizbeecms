import assert from "node:assert/strict";
import { test } from "node:test";

import { pollFleetUsage, siteUsageUrl, type FleetSite } from "./fleet.ts";

const site = {
  id: "s1",
  name: "Acme",
  slug: "acme",
  workerName: "bizbeecms-cms-acme",
  openrouterKeyHash: null,
};

test("siteUsageUrl targets the site's own CMS Worker under the account subdomain", () => {
  assert.equal(
    siteUsageUrl(site, "vali-draganescu88"),
    "https://bizbeecms-cms-acme.vali-draganescu88.workers.dev/api/pm/ai-usage",
  );
});

test("siteUsageUrl derives the worker name from the slug when none was recorded", () => {
  // A site can be reachable before a deploy callback ever stamped workerName.
  assert.equal(
    siteUsageUrl({ ...site, workerName: null }, "acct"),
    "https://bizbeecms-cms-acme.acct.workers.dev/api/pm/ai-usage",
  );
});

const contractBody = {
  month: "2026-07",
  billableNanoUsd: 1_300_000,
  rawNanoUsd: 1_000_000,
  quotaUsd: 10,
};

const opts = {
  workersSubdomain: "acct",
  cmsAuthSecret: "secret",
  provisioningKey: "prov-key",
};

/** A fetchImpl serving per-URL-substring responses; anything unmatched rejects. */
function fetchStub(routes: Array<[match: string, body: unknown]>): typeof fetch {
  return (async (url: unknown) => {
    const target = String(url);
    for (const [match, body] of routes) {
      if (target.includes(match)) {
        return { ok: true, json: async () => body } as Response;
      }
    }
    throw new Error(`no route for ${target}`);
  }) as typeof fetch;
}

test("pollFleetUsage: a dead site renders unreachable without failing the fleet", async () => {
  const sites: FleetSite[] = [
    { ...site, id: "up", slug: "up", workerName: null },
    { ...site, id: "down", slug: "down", workerName: null },
  ];
  const rows = await pollFleetUsage(sites, {
    ...opts,
    fetchImpl: fetchStub([["bizbeecms-cms-up.", contractBody]]),
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    siteId: "up",
    name: "Acme",
    slug: "up",
    state: "ok",
    usage: contractBody,
    drift: null, // no minted key → no reconciliation signal
  });
  assert.deepEqual(rows[1], { siteId: "down", name: "Acme", slug: "down", state: "unreachable" });
});

test("pollFleetUsage: a minted key adds OpenRouter drift against reported raw", async () => {
  const rows = await pollFleetUsage([{ ...site, openrouterKeyHash: "hash-1" }], {
    ...opts,
    fetchImpl: fetchStub([
      ["/api/pm/ai-usage", contractBody],
      // OpenRouter reports $0.0015 actually spent vs the site's 0.001 raw.
      ["hash-1", { data: { usage: 0.0015 } }],
    ]),
  });
  assert.equal(rows[0].state, "ok");
  assert.deepEqual(rows[0].state === "ok" ? rows[0].drift : null, {
    openRouterNanoUsd: 1_500_000,
    driftNanoUsd: 500_000,
    driftRatio: 500_000 / 1_500_000,
  });
});

test("pollFleetUsage: no key hash never dials OpenRouter", async () => {
  let openRouterHit = false;
  const rows = await pollFleetUsage([site], {
    ...opts,
    fetchImpl: (async (url: unknown) => {
      if (String(url).includes("openrouter.ai")) openRouterHit = true;
      return { ok: true, json: async () => contractBody } as Response;
    }) as typeof fetch,
  });
  assert.equal(openRouterHit, false);
  assert.equal(rows[0].state, "ok");
});
