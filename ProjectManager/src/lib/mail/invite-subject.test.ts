import { test } from "node:test";
import assert from "node:assert/strict";
import { customDomain, inviteSubject } from "./invite-subject.ts";

const GENERIC = "You've been invited to bizbeecms ProjectManager";
const withDomain = (d: string) => `${d}: You are invited to use BizBeeCMS`;

test("customDomain: workers.dev is NOT a custom domain", () => {
  assert.equal(
    customDomain("https://bizbeecms-cms-acme.myacct.workers.dev"),
    null,
  );
});

test("customDomain: real custom domain returns the host", () => {
  assert.equal(customDomain("https://restovista.com"), "restovista.com");
});

test("customDomain: strips a leading www.", () => {
  assert.equal(customDomain("https://www.restovista.com"), "restovista.com");
});

test("customDomain: empty / undefined / malformed → null", () => {
  assert.equal(customDomain(undefined), null);
  assert.equal(customDomain(""), null);
  assert.equal(customDomain("not a url"), null);
  assert.equal(customDomain("http://localhost:3601"), null);
});

test("inviteSubject: custom domain → prefixed subject", () => {
  assert.equal(
    inviteSubject("https://restovista.com", GENERIC, withDomain),
    "restovista.com: You are invited to use BizBeeCMS",
  );
});

test("inviteSubject: workers.dev → generic subject (no prefix)", () => {
  assert.equal(
    inviteSubject(
      "https://bizbeecms-cms-acme.myacct.workers.dev",
      GENERIC,
      withDomain,
    ),
    GENERIC,
  );
});

test("inviteSubject: no APP_ORIGIN → generic subject", () => {
  assert.equal(inviteSubject(undefined, GENERIC, withDomain), GENERIC);
});
