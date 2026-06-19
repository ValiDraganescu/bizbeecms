/**
 * Admin section links — shared by the client SidebarShell AND the server /admin
 * index page. Kept in a PLAIN module (NOT a `"use client"` component): importing a
 * non-component VALUE export from a client module into a server component gets
 * mangled by the bundler into a client-reference proxy, so `.map` blows up at
 * runtime (`ADMIN_SECTIONS.map is not a function`). A normal module crosses the
 * boundary cleanly both ways.
 *
 * `key` is both the i18n label key (adminNav.<key>) and description key
 * (adminNav.desc.<key>); "home" has no desc (it's the landing itself). Settings'
 * sub-pages are grouped under one "Settings" link → content-locales.
 */
export const ADMIN_SECTIONS = [
  { key: "chat", href: "/admin/chat" },
  { key: "pages", href: "/admin/pages" },
  { key: "components", href: "/admin/components" },
  { key: "media", href: "/admin/media" },
  { key: "settings", href: "/admin/settings/content-locales" },
] as const;
