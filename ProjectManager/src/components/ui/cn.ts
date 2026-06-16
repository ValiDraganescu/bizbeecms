/**
 * Tiny class-name joiner. Filters out falsy values and joins with spaces.
 * Kept dependency-free on purpose (no clsx/tailwind-merge needed for this set).
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
