# Email sender setup — invite delivery via Cloudflare Email

Invites (PM and CMS) send through the Cloudflare **`send_email`** Worker binding
(`env.EMAIL.send()`). Until the sender domain is set up, invites still work — the
flow degrades to showing a **copyable accept link** in-app (`delivered: false`).
This doc makes real emails go out.

Domain: **`bizbeecms.com`**
DNS host: **Cloudflare** (nameservers `angela.ns.cloudflare.com` /
`paul.ns.cloudflare.com` — already pointed correctly).

> **Registrar note:** your registrar only holds the nameserver delegation, which
> is already done. You do **not** touch the registrar for any of the steps below
> — every record is edited in the **Cloudflare dashboard**. The registrar section
> at the end is only a fallback if you ever move DNS off Cloudflare.

---

## How `send_email` works (read this first)

The binding has two modes — pick **mode B** for invites:

- **Mode A — `destination_address` set:** can only send to that ONE pre-verified
  address (it gets a confirmation email you must click). Good for "contact form →
  my inbox", **useless for invites** (invitees are arbitrary).
- **Mode B — no `destination_address`:** can send to **any** recipient. Requires
  the sender domain's DNS (SPF + DKIM + DMARC) to be in place. **This is what we
  use.** No per-recipient verification.

---

## Part 1 — Cloudflare dashboard

### Step 1. Enable Email Routing on the zone

This provisions the MX, SPF, and DKIM records Cloudflare needs.

1. Dashboard → select **bizbeecms.com** → left nav **Email** → **Email Routing**.
2. Click **Get started / Enable**. Accept the records it offers to add.
3. You don't need a routing rule (we only send, not receive) — but enabling is
   what unlocks the DKIM key + sending.

After enabling, these records exist automatically (verify under
**DNS → Records**):

| Type | Name | Content | Priority |
|------|------|---------|----------|
| MX   | `bizbeecms.com` | `route1.mx.cloudflare.net` | 70 |
| MX   | `bizbeecms.com` | `route2.mx.cloudflare.net` | 57 |
| MX   | `bizbeecms.com` | `route3.mx.cloudflare.net` | 13 |
| TXT  | `cf2024-1._domainkey.bizbeecms.com` | (DKIM — long `v=DKIM1; …` value, see below) | — |
| TXT  | `bizbeecms.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | — |

The DKIM TXT value Cloudflare uses for this zone:

```
v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiweykoi+o48IOGuP7GR3X0MOExCUDY/BCRHoWBnh3rChl7WhdyCxW3jgq1daEjPPqoi7sJvdg5hEQVsgVRQP4DcnQDVjGMbASQtrY4WmB1VebF+RPJB2ECPsEDTpeiI5ZyUAwJaVX7r6bznU67g7LvFq35yIo4sdlmtZGV+i0H4cpYH9+3JJ78km4KXwaf9xUJCWF6nxeD+qG6Fyruw1Qlbds2r85U9dkNDVAS3gioCvELryh1TxKGiVTkg4wqHTyHfWsp7KD3WQHYJn0RyfJJu6YEmL77zonn7p2SRMvTMP3ZEXibnC9gz3nnhR6wcYL8Q7zXypKTMD58bTixDSJwIDAQAB
```
(If the dashboard shows a different key for your zone, trust the dashboard — keys
can rotate.)

### Step 2. Add a DMARC record (Cloudflare does NOT add this automatically)

Unrestricted sending needs DMARC. DNS → Records → **Add record**:

- **Type:** TXT
- **Name:** `_dmarc`
- **Content:** `v=DMARC1; p=none; rua=mailto:dmarc@bizbeecms.com`

`p=none` = monitor only (safe start). Tighten to `p=quarantine` later once you've
confirmed delivery. The `rua` mailbox is optional reporting — drop it if you
don't want aggregate reports.

### Step 3. Verify the sender domain is ready

DNS → Records: confirm SPF, the `_domainkey` DKIM TXT, and `_dmarc` all show as
**Proxied: DNS only** (grey cloud — TXT/MX are never proxied) and resolve.

Quick check from a terminal:

```sh
dig +short TXT bizbeecms.com               # expect the v=spf1 … line
dig +short TXT cf2024-1._domainkey.bizbeecms.com   # expect v=DKIM1 …
dig +short TXT _dmarc.bizbeecms.com         # expect v=DMARC1 …
dig +short MX  bizbeecms.com               # expect route1/2/3.mx.cloudflare.net
```

All four answering = the sender domain is verified for sending.

---

## Part 2 — Code (PM and CMS)

Both apps already have the sender code (`lib/mail/send-invite.ts`); only two
things are pending: the binding and the `from` address.

### Step 4. Enable the binding

**ProjectManager/wrangler.jsonc** — uncomment the `send_email` block (around line
71) and use **no** `destination_address` (mode B):

```jsonc
"send_email": [
  { "name": "EMAIL" }
]
```

Do the **same** in `CMS/wrangler.jsonc` (the CMS deployer carries this into each
per-Site Worker). The CMS block is likewise commented today.

### Step 5. Set a real `from` address

In `lib/mail/send-invite.ts` change the placeholder:

```diff
- const FROM_ADDRESS = "noreply@bizbeecms.example";
+ const FROM_ADDRESS = "noreply@bizbeecms.com";
```

The `from` domain MUST match the verified sender domain (bizbeecms.com), or
Cloudflare rejects the send. (PM and CMS each have their own copy of this file.)

### Step 6. Confirm `APP_ORIGIN`

Already set for PM (`"APP_ORIGIN": "https://manager.bizbeecms.com"` in
wrangler.jsonc). The CMS deployer injects `APP_ORIGIN` per-Site. This is what
makes the accept link in the email point at a trusted origin — leave it.

### Step 7. Regenerate types + redeploy

```sh
# PM
cd ProjectManager
npx wrangler types          # so env.EMAIL is typed (optional; code casts already)
npm run deploy

# CMS — redeploy a site from the PM (manager.bizbeecms.com) so the new
# binding + from-address ship into the per-Site Worker.
```

### Step 8. Test

Invite a test address from PM (`/invite`) or CMS. Expect:

- The success panel says **delivered** (not the "copy this link" fallback).
- The email arrives. (`delivered: false` still falling back? → DNS not fully
  propagated yet, or `from` domain mismatch. Re-check Step 3 + Step 5.)

---

## Idempotency / re-running

Everything above is safe to re-do:

- Re-enabling Email Routing is a no-op if already enabled.
- Adding a DNS record that already exists (same type+name+content) is rejected by
  Cloudflare as a duplicate — harmless; just leave the existing one.
- The binding + `from` change are in version control; redeploy is idempotent.

---

## Why not auto-run this at deploy?

It was considered. The DNS writes need a **separate Cloudflare API token**
(Zone:DNS:Edit + Email Routing:Edit) — the wrangler OAuth token lacks DNS-edit
scope. More importantly this is **one-time zone setup**, not per-deploy work:
wiring it into the per-Site deploy pipeline would re-run account-level DNS on
every Worker push and couple two unrelated concerns. If you later want it
scripted, the clean shape is a standalone `scripts/setup-email-dns.mjs` reading
`CLOUDFLARE_API_TOKEN`, run once or in CI — not inside the deployer.

---

## Registrar fallback (only if DNS ever leaves Cloudflare)

Today DNS is on Cloudflare nameservers, so you edit at Cloudflare. If you ever
point the domain's DNS at the registrar instead, recreate the **same** records
there: the three MX (`route1/2/3.mx.cloudflare.net`), the SPF TXT, the DKIM TXT
(`cf2024-1._domainkey`), and the DMARC TXT. Values are identical — only the place
you enter them changes.
