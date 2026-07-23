import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DRIFT_ALERT_FLOOR_NANO_USD,
  NANO_USD_PER_USD,
  circuitBreakerLimitUsd,
  computeDrift,
  formatUsd,
  formatUsdFromNano,
  isDriftSignificant,
  parseOpenRouterKeyUsageUsd,
  parseSiteAiUsage,
  summarizeFleet,
  usageRatio,
  type FleetSiteUsage,
} from "./usage.ts";

const usd = (n: number) => n * NANO_USD_PER_USD;

test("circuit-breaker cap is 2.5x the quota, rounded up", () => {
  assert.equal(circuitBreakerLimitUsd(10), 25);
  assert.equal(circuitBreakerLimitUsd(1), 3); // ceil(2.5)
  assert.equal(circuitBreakerLimitUsd(7), 18); // ceil(17.5)
  assert.equal(circuitBreakerLimitUsd(0), 0);
});

test("no quota → no cap; a junk quota is treated as no quota, never as $0", () => {
  assert.equal(circuitBreakerLimitUsd(null), null);
  assert.equal(circuitBreakerLimitUsd(undefined), null);
  assert.equal(circuitBreakerLimitUsd(Number.NaN), null);
});

test("nano-USD renders as dollars; a corrupt counter never renders NaN", () => {
  assert.equal(formatUsdFromNano(usd(12.3456)), "$12.3456");
  assert.equal(formatUsdFromNano(700_000), "$0.0007");
  assert.equal(formatUsdFromNano(0), "$0.0000");
  assert.equal(formatUsdFromNano(-5), "$0.0000");
  assert.equal(formatUsdFromNano(Number.NaN), "$0.0000");
  assert.equal(formatUsd(10), "$10.00");
  assert.equal(formatUsd(Number.NaN), "$0.00");
});

test("parseSiteAiUsage reads a well-formed Contract D body", () => {
  assert.deepEqual(
    parseSiteAiUsage({
      month: "2026-07",
      billableNanoUsd: 1_300_000_000,
      rawNanoUsd: 1_000_000_000,
      quotaUsd: 10,
    }),
    {
      month: "2026-07",
      billableNanoUsd: 1_300_000_000,
      rawNanoUsd: 1_000_000_000,
      quotaUsd: 10,
    },
  );
});

test("parseSiteAiUsage degrades junk counters to 0 and a junk month to blank", () => {
  assert.deepEqual(parseSiteAiUsage({ month: "nope", billableNanoUsd: "x", rawNanoUsd: -3 }), {
    month: "",
    billableNanoUsd: 0,
    rawNanoUsd: 0,
    quotaUsd: null,
  });
});

test("parseSiteAiUsage: a missing quota is 'unquotaed' (null), not 'over quota' (0)", () => {
  assert.equal(parseSiteAiUsage({ month: "2026-07" })!.quotaUsd, null);
  assert.equal(parseSiteAiUsage({ quotaUsd: null })!.quotaUsd, null);
  // ...but an explicit zero quota is a real, meaningful zero.
  assert.equal(parseSiteAiUsage({ quotaUsd: 0 })!.quotaUsd, 0);
});

test("parseSiteAiUsage returns null only when the body isn't an object", () => {
  for (const junk of [null, undefined, 42, "nope", []]) {
    if (Array.isArray(junk)) continue;
    assert.equal(parseSiteAiUsage(junk), null);
  }
});

test("parseOpenRouterKeyUsageUsd accepts usage at either nesting level", () => {
  assert.equal(parseOpenRouterKeyUsageUsd({ data: { usage: 1.25 } }), 1.25);
  assert.equal(parseOpenRouterKeyUsageUsd({ usage: 0.5 }), 0.5);
  assert.equal(parseOpenRouterKeyUsageUsd({ data: { usage: 0 } }), 0);
});

test("parseOpenRouterKeyUsageUsd gives up (null) rather than inventing a $0", () => {
  assert.equal(parseOpenRouterKeyUsageUsd({ data: {} }), null);
  assert.equal(parseOpenRouterKeyUsageUsd({ usage: "n/a" }), null);
  assert.equal(parseOpenRouterKeyUsageUsd(null), null);
  assert.equal(parseOpenRouterKeyUsageUsd("nope"), null);
});

test("drift is signed: positive = OpenRouter billed more than we metered", () => {
  const under = computeDrift(usd(1), 1.5);
  assert.equal(under!.openRouterNanoUsd, usd(1.5));
  assert.equal(under!.driftNanoUsd, usd(0.5));
  assert.equal(under!.driftRatio, 1 / 3);

  const over = computeDrift(usd(2), 1.5);
  assert.equal(over!.driftNanoUsd, usd(-0.5));
});

test("drift is null when the OpenRouter side is unreadable — unknown ≠ zero", () => {
  assert.equal(computeDrift(usd(1), null), null);
});

test("a key that billed $0 has no meaningful drift ratio", () => {
  const drift = computeDrift(0, 0);
  assert.equal(drift!.driftNanoUsd, 0);
  assert.equal(drift!.driftRatio, null);
  assert.equal(isDriftSignificant(drift), false);
});

test("drift alerts need BOTH >10% and more than a cent absolute", () => {
  // 100% off but sub-cent: rounding noise on a quiet site, not an alert.
  assert.equal(isDriftSignificant(computeDrift(0, 0.001)), false);
  // Above the floor but only 5% off: within tolerance.
  assert.equal(isDriftSignificant(computeDrift(usd(1), 1.05)), false);
  // Above the floor and 50% off: a metering bug worth looking at.
  assert.equal(isDriftSignificant(computeDrift(usd(1), 2)), true);
  assert.equal(DRIFT_ALERT_FLOOR_NANO_USD, usd(0.01));
});

test("usageRatio maps spend onto a quota; an unset or zero quota has no ratio", () => {
  assert.equal(usageRatio(usd(5), 10), 0.5);
  assert.equal(usageRatio(usd(12), 10), 1.2);
  assert.equal(usageRatio(usd(5), null), null);
  assert.equal(usageRatio(usd(5), 0), null);
});

function ok(id: string, billable: number, raw: number, quotaUsd: number | null, openRouterUsd: number | null): FleetSiteUsage {
  return {
    siteId: id,
    name: id,
    slug: id,
    state: "ok",
    usage: { month: "2026-07", billableNanoUsd: billable, rawNanoUsd: raw, quotaUsd },
    drift: computeDrift(raw, openRouterUsd),
  };
}

test("fleet totals sum reporting sites and count the rest as unreachable", () => {
  const totals = summarizeFleet(
    [
      ok("a", usd(3), usd(2), 10, 2),
      ok("b", usd(1), usd(0.8), null, null),
      { siteId: "c", name: "c", slug: "c", state: "unreachable" },
    ],
    100,
  );

  assert.equal(totals.reporting, 2);
  assert.equal(totals.unreachable, 1);
  assert.equal(totals.billableNanoUsd, usd(4));
  assert.equal(totals.rawNanoUsd, usd(2.8));
  assert.equal(totals.quotaUsd, 10); // the null-quota site contributes 0
  assert.equal(totals.poolRatio, 0.04);
  assert.equal(totals.driftAlerts, 0);
});

test("fleet totals count only the sites whose drift crossed the threshold", () => {
  const totals = summarizeFleet(
    [ok("a", usd(1), usd(1), 10, 5), ok("b", usd(1), usd(1), 10, 1.01)],
    null,
  );
  assert.equal(totals.driftAlerts, 1);
  assert.equal(totals.poolRatio, null); // no pool configured → no ratio
});

test("an all-unreachable fleet reports zeroes, not NaN", () => {
  const totals = summarizeFleet(
    [{ siteId: "a", name: "a", slug: "a", state: "unreachable" }],
    50,
  );
  assert.deepEqual(totals, {
    reporting: 0,
    unreachable: 1,
    billableNanoUsd: 0,
    rawNanoUsd: 0,
    quotaUsd: 0,
    poolRatio: 0,
    driftAlerts: 0,
  });
});
