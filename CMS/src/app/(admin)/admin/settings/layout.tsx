import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * Settings shell: a second sidebar EXACTLY like the page builder's left rail —
 * full-height, flush against the main admin sidebar (w-[260px], raised surface,
 * right border) — with the active settings page scrolling independently on the
 * right. Pages no longer render their own nav; this wraps all /admin/settings/*.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-surface-raised">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}
