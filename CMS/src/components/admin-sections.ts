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
 *
 * `children` (optional) are sub-pages shown indented under the section when its
 * route is active — the parent link still navigates (to the first child's page).
 */
export type AdminSection = {
  key: string;
  href: string;
  children?: { key: string; href: string }[];
};

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: "pageBuilder", href: "/admin/page-builder" },
  {
    key: "components",
    href: "/admin/components",
    children: [
      { key: "componentsImportExport", href: "/admin/components" },
      { key: "componentsDevelop", href: "/admin/components/develop" },
    ],
  },
  { key: "collections", href: "/admin/collections" },
  { key: "media", href: "/admin/media" },
  { key: "settings", href: "/admin/settings/content-locales" },
];
