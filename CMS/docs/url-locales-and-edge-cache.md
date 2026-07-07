# URL locales + edge cache

Operator guide for how published pages pick a language from the URL and how the
per-page edge cache works. This is about **published** pages — the admin, the
preview iframe, and the AI chat are never affected by any of this.

## Language in the URL

Every Site has one **default content locale** and zero or more extra locales
(configured in Settings → Content locales).

- The **default locale is unprefixed**. Existing links keep working exactly as
  before — `/about`, `/pricing`, `/`.
- **Every other locale gets a `/<code>/` prefix**: `/fi/about`, `/et/pricing`.
  `/fi` (no trailing slash) is the Finnish home page.

The URL alone decides the language. There is no cookie, no "remember my
language" redirect, no geo-guess. `/about` is always the default locale and
`/fi/about` is always Finnish — that is what makes a page cacheable and what
makes each language separately indexable by Google.

### The language switcher

The built-in **LanguageSwitcher** component navigates: picking a language sends
the visitor to the same page under that language's URL. It does not reload in
place or set a cookie.

### Internal links translate automatically

You author links against the default-locale page (pick the page in the link
field as usual). When the page renders in another locale, every internal link
is rewritten to that locale's URL for you. You never hand-type `/fi/...` into a
link — author once, it follows the visitor's language.

### Reserved slugs

A **top-level** page slug can't be the same as a locale code. If Finnish is
enabled you can't create a top-level page whose slug is `fi` — it would collide
with the `/fi/...` language prefix. The editor and the AI both refuse it with a
clear message. (Child pages named `fi` are fine — only the first URL segment
clashes.)

## Localized slugs (translated URLs)

By default a page keeps the same slug in every language: `/fi/about`. To give a
language its own slug — `/fi/meista` instead of `/fi/about` — set a **per-locale
slug** in the page's settings (the "Localized slugs" section, one field per
extra locale).

- Leave a locale's field **empty** to fall back to the default slug.
- A per-locale slug must be **unique among its siblings** for that locale — the
  editor rejects a duplicate.
- Each URL is canonical for exactly one language: once you set `meista` for
  Finnish, `/fi/about` stops resolving (404) and `/about` stays default-locale
  only. One page = one URL per language, no duplicate-content aliases.

`hreflang` tags, the sitemap, the language switcher, and internal links all use
the translated slug automatically. You only fill in the field.

## SEO

Published pages emit, with no extra work:

- A **canonical** URL for the current language.
- **`hreflang`** alternates for every configured locale (so search engines link
  the translations together).
- A public **`/sitemap.xml`** listing every published page in every locale.

## Edge cache (per page)

Cloudflare can serve a published page straight from its edge cache — no Worker
run, no database read — so repeat visitors get it instantly and your Site costs
less to run.

It is **off by default** and opt-in **per page**. In a page's settings, the
**Edge cache** select offers:

| Option      | Meaning                                    |
|-------------|--------------------------------------------|
| **Off**     | Never cache (default). Always fresh.       |
| **5 minutes** | Serve from cache for up to 5 min.        |
| **1 hour**  | Serve from cache for up to 1 hour.         |
| **1 day**   | Serve from cache for up to 1 day.          |

**When to turn it on:** stable pages — home, about, contact, terms, pricing.
**Keep it Off** for anything showing live or per-visitor data (a feed, a form
result, anything that must always be current).

Only published GET page views are ever cached. The admin, preview, API routes,
media, and any response that sets a cookie are **never** cached.

### Publishing busts the cache

You never have to manually clear the cache after an edit:

- **Publishing, unpublishing, or deleting a page** immediately clears that
  page's cached copy — your change is visible right away.
- **Changing a page's slug, parent, or a localized slug** also clears *all*
  cached pages, because other pages link to it and those links have to update.
- **Site-wide changes** — theme colours, theme fonts, brand identity, a
  component publish, or content-locale settings — clear every cached page, since
  they can change how any page looks.

So: turn the cache on for stable pages and forget about it. Publish as normal
and visitors always see the current version; the only staleness window is the
minutes/hours you chose, and only if you make an out-of-band change (e.g. edit
the underlying data an API page reads) that the CMS can't see.

> **Note (deploys):** the edge cache is enforced by the deployed Site's Worker.
> A brand-new Site or a Site that predates this feature picks it up on its next
> release/redeploy — it is not something you toggle at the infrastructure level.
