"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui";

export type NavItem = { id: string; label: string };

/**
 * Sticky side menu for the design-system page. Scroll-spies the section ids and
 * marks the active link with aria-current="location". Links are real anchors,
 * so keyboard and no-JS both work; clicking updates the hash and the browser
 * handles the (reduced-motion-aware) scroll.
 *
 * Active section = the last one whose top edge has scrolled above an activation
 * line ~96px below the viewport top (under the sticky header). Computed on
 * scroll/resize with rAF throttling — simpler and more reliable than mapping
 * IntersectionObserver ratios across wildly different section heights.
 */
export function DesignSystemNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const ACTIVATION_OFFSET = 96; // header height + a little breathing room
    let frame = 0;

    const compute = () => {
      frame = 0;
      const line = ACTIVATION_OFFSET;
      let current = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top - line <= 0) {
          current = section.id;
        } else {
          break;
        }
      }
      // At the very bottom, force-select the last section so short trailing
      // sections still light up.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) current = sections[sections.length - 1].id;

      setActive(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <nav aria-label="Components" className="flex flex-col gap-0.5">
      <p className="px-3 pb-2 text-xs font-medium tracking-wide text-foreground-muted">
        Components
      </p>
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={isActive ? "location" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary-subtle font-medium text-primary"
                : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
