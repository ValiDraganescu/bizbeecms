/** The standard tiny inline busy spinner (inherits `currentColor`), used inside
 *  buttons and menus next to their label. Purely presentational. */
export function Spinner() {
  return (
    <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  );
}
