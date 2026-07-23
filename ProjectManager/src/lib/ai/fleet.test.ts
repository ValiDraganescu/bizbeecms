import assert from "node:assert/strict";
import { test } from "node:test";

import { siteUsageUrl } from "./fleet.ts";

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
