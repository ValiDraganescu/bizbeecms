import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDailyUsage,
  aiUsageDay,
  dailyMonthPatterns,
  dailyPurposeKey,
  formatUsdAmount,
  lastDays,
  sumAllTimeBillable,
  usdFromNanoFine,
} from "./summary.ts";
import { AI_PURPOSES } from "../ai-config/types.ts";

// A mid-month moment: 2026-07-15T12:00:00Z.
const midMonth = new Date(Date.UTC(2026, 6, 15, 12));
// The 31st: the 30-day window alone would miss July 1st.
const monthEnd = new Date(Date.UTC(2026, 6, 31, 23, 59));

test("aiUsageDay: UTC day bucket, not the local one", () => {
  // 23:30 UTC is already "tomorrow" in UTC+2 — the bucket must stay UTC.
  assert.equal(aiUsageDay(new Date(Date.UTC(2026, 6, 15, 23, 30))), "2026-07-15");
});

test("dailyPurposeKey: the documented scheme", () => {
  assert.equal(dailyPurposeKey("2026-07-15", "assistant"), "ai:d:2026-07-15:assistant");
});

test("lastDays: n days ending today, oldest first, month boundary crossed", () => {
  const days = lastDays(midMonth, 30);
  assert.equal(days.length, 30);
  assert.equal(days[0], "2026-06-16");
  assert.equal(days[29], "2026-07-15");
});

test("dailyMonthPatterns: mid-month the 30-day window spans two month prefixes", () => {
  assert.deepEqual(dailyMonthPatterns(midMonth), ["ai:d:2026-06-%", "ai:d:2026-07-%"]);
});

test("dailyMonthPatterns: on the 31st the span is exactly the current month", () => {
  assert.deepEqual(dailyMonthPatterns(monthEnd), ["ai:d:2026-07-%"]);
});

test("dailyMonthPatterns: early in a month the window still reaches the previous month", () => {
  assert.deepEqual(dailyMonthPatterns(new Date(Date.UTC(2026, 7, 2))), [
    "ai:d:2026-07-%",
    "ai:d:2026-08-%",
  ]);
});

test("aggregateDailyUsage: per-day sums across purposes, zero-filled, oldest first", () => {
  const { days } = aggregateDailyUsage(
    [
      { key: "ai:d:2026-07-15:assistant", count: 100 },
      { key: "ai:d:2026-07-15:chatAgent", count: 40 },
      { key: "ai:d:2026-07-01:translate", count: 7 },
    ],
    midMonth,
  );
  assert.equal(days.length, 30);
  assert.deepEqual(days[29], { day: "2026-07-15", nanoUsd: 140 });
  assert.deepEqual(days[15], { day: "2026-07-01", nanoUsd: 7 });
  assert.deepEqual(days[0], { day: "2026-06-16", nanoUsd: 0 });
});

test("aggregateDailyUsage: purposes total the CURRENT month only, all purposes present", () => {
  const { purposes } = aggregateDailyUsage(
    [
      { key: "ai:d:2026-07-15:assistant", count: 100 },
      { key: "ai:d:2026-07-01:assistant", count: 50 },
      { key: "ai:d:2026-06-30:assistant", count: 999 }, // last month — days view only
    ],
    midMonth,
  );
  assert.equal(purposes.length, AI_PURPOSES.length);
  assert.deepEqual(
    purposes.find((p) => p.purpose === "assistant"),
    { purpose: "assistant", nanoUsd: 150 },
  );
  assert.deepEqual(
    purposes.find((p) => p.purpose === "imageGenerate"),
    { purpose: "imageGenerate", nanoUsd: 0 },
  );
});

test("aggregateDailyUsage: on the 31st the month totals still include the 1st", () => {
  const { days, purposes } = aggregateDailyUsage(
    [{ key: "ai:d:2026-07-01:assistant", count: 42 }],
    monthEnd,
  );
  // Outside the 30-day view (which starts July 2nd)…
  assert.equal(days.some((d) => d.day === "2026-07-01"), false);
  // …but inside the month total.
  assert.equal(purposes.find((p) => p.purpose === "assistant")?.nanoUsd, 42);
});

test("aggregateDailyUsage: malformed keys, unknown purposes and other schemes never leak in", () => {
  const { days, purposes } = aggregateDailyUsage(
    [
      { key: "ai:d:2026-07-15:notAPurpose", count: 500 },
      { key: "ai:2026-07:billable", count: 500 },
      { key: "chat:agent1:2026-07-15:cost", count: 500 },
      { key: "ai:d:garbage:assistant", count: 500 },
      { key: "ai:d:2026-07-15:assistant", count: NaN },
    ],
    midMonth,
  );
  assert.equal(days.reduce((s, d) => s + d.nanoUsd, 0), 0);
  assert.equal(purposes.reduce((s, p) => s + p.nanoUsd, 0), 0);
});

test("sumAllTimeBillable: sums exactly the monthly billable meters", () => {
  assert.equal(
    sumAllTimeBillable([
      { key: "ai:2026-06:billable", count: 1_000 },
      { key: "ai:2026-07:billable", count: 250 },
      { key: "ai:2026-07:raw", count: 9_999 }, // provider cost — never billed
      { key: "ai:d:2026-07-15:assistant", count: 9_999 }, // daily key — not a month
      { key: "ai:garbage:billable", count: 9_999 },
    ]),
    1_250,
  );
});

test("sumAllTimeBillable: empty read sums to 0", () => {
  assert.equal(sumAllTimeBillable([]), 0);
});

test("usdFromNanoFine: keeps sub-cent spend that round-to-cents would flatten", () => {
  assert.equal(usdFromNanoFine(1_234_567), 0.001235);
  assert.equal(usdFromNanoFine(0), 0);
  assert.equal(usdFromNanoFine(1_500_000_000), 1.5);
});

test("formatUsdAmount: the display ladder", () => {
  assert.equal(formatUsdAmount(0), "$0");
  assert.equal(formatUsdAmount(1.5), "$1.50");
  assert.equal(formatUsdAmount(0.001235), "$0.0012");
  assert.equal(formatUsdAmount(0.00005), "<$0.0001");
});
