"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";

/**
 * Combobox — a custom, fully-controlled, accessible select.
 *
 * Features: searchable, single or multiple selection, min/max selected items,
 * custom item rendering, custom search predicate, and a configurable selected-
 * items preview ("Admin", "Editor", "+3").
 *
 * Item model: works out of the box with the default Option shape
 * `{ id, label, data? }` (zero config), or with any custom item type T via the
 * `getOptionValue` / `getOptionLabel` / `getOptionKey` accessors.
 *
 * State: controlled only. Pass `value` + `onChange`. In single mode `value` is
 * `T | null`; in multiple mode it is `T[]`.
 *
 * Accessibility: WAI-ARIA combobox pattern — combobox/listbox/option roles,
 * `aria-activedescendant`, full keyboard support (↑/↓/Home/End/Enter/Esc, plus
 * type-to-search when not searchable), focus management, and live announcements.
 */

export type DefaultOption<D = unknown> = {
  id: string;
  label: string;
  data?: D;
};

/** State passed to a custom `renderOption`. */
export type OptionRenderState = {
  selected: boolean;
  active: boolean;
  disabled: boolean;
};

type Accessors<T> = {
  /** Stable value used for equality + form value. Default: option.id */
  getOptionValue?: (option: T) => string;
  /** Human label used for the trigger, chips, and default filtering. Default: option.label */
  getOptionLabel?: (option: T) => string;
  /** React key. Default: getOptionValue(option) */
  getOptionKey?: (option: T) => string;
  /** Per-option disabled flag. Default: false */
  getOptionDisabled?: (option: T) => boolean;
};

type SharedProps<T> = Accessors<T> & {
  options: T[];
  /** Show the search input inside the popup. Default: true. */
  searchable?: boolean;
  /** Custom search predicate. Default: case-insensitive substring on label. */
  filterOption?: (option: T, query: string) => boolean;
  /** Custom item UI. Receives the option and its render state. */
  renderOption?: (option: T, state: OptionRenderState) => ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

type SingleProps<T> = SharedProps<T> & {
  multiple?: false;
  value: T | null;
  onChange: (value: T | null) => void;
};

type MultipleProps<T> = SharedProps<T> & {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
  /** Minimum selected items; selections at or below this can't be removed. */
  min?: number;
  /** Maximum selected items; selecting more is blocked. */
  max?: number;
  /** How many selected labels to show before collapsing to "+N". Default: 2. */
  previewCount?: number;
};

export type ComboboxProps<T> = SingleProps<T> | MultipleProps<T>;

function defaultGetValue<T>(o: T): string {
  return (o as DefaultOption).id;
}
function defaultGetLabel<T>(o: T): string {
  return (o as DefaultOption).label;
}

const ChevronIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0 text-foreground-muted"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ClearIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export function Combobox<T>(props: ComboboxProps<T>) {
  const {
    options,
    searchable = true,
    filterOption,
    renderOption,
    placeholder = "Select…",
    searchPlaceholder = "Search…",
    emptyMessage = "No matches",
    disabled = false,
    id,
    className,
    getOptionValue = defaultGetValue,
    getOptionLabel = defaultGetLabel,
    getOptionKey,
    getOptionDisabled,
  } = props;

  const multiple = props.multiple === true;
  const reactId = useId();
  const baseId = id ?? reactId;
  const listboxId = `${baseId}-listbox`;
  const labelOf = useCallback(
    (o: T) => getOptionLabel(o),
    [getOptionLabel],
  );
  const valueOf = useCallback((o: T) => getOptionValue(o), [getOptionValue]);
  const keyOf = useCallback(
    (o: T) => (getOptionKey ? getOptionKey(o) : valueOf(o)),
    [getOptionKey, valueOf],
  );
  const isOptionDisabled = useCallback(
    (o: T) => (getOptionDisabled ? getOptionDisabled(o) : false),
    [getOptionDisabled],
  );

  // Normalize the controlled value into an array of selected options.
  const selected: T[] = useMemo(() => {
    if (multiple) return (props.value as T[]) ?? [];
    const v = props.value as T | null;
    return v == null ? [] : [v];
  }, [multiple, props.value]);

  const selectedValues = useMemo(
    () => new Set(selected.map(valueOf)),
    [selected, valueOf],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announce, setAnnounce] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const predicate = useCallback(
    (o: T, q: string) => {
      if (!q) return true;
      if (filterOption) return filterOption(o, q);
      return labelOf(o).toLowerCase().includes(q.toLowerCase());
    },
    [filterOption, labelOf],
  );

  const filtered = useMemo(
    () => options.filter((o) => predicate(o, query)),
    [options, predicate, query],
  );

  const max = multiple ? props.max : undefined;
  const min = multiple ? props.min : undefined;
  const atMax = max != null && selected.length >= max;

  const isSelectable = useCallback(
    (o: T) => {
      if (isOptionDisabled(o)) return false;
      // In multi mode, block adding new items once at max (but allow toggling
      // off ones already selected).
      if (multiple && atMax && !selectedValues.has(valueOf(o))) return false;
      return true;
    },
    [isOptionDisabled, multiple, atMax, selectedValues, valueOf],
  );

  // ---- open / close ----
  const openPopup = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const closePopup = useCallback(
    (focusTrigger = true) => {
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      if (focusTrigger) triggerRef.current?.focus();
    },
    [],
  );

  // Position the popup under the trigger using fixed positioning so it escapes
  // any overflow:hidden / clipping ancestor.
  const [popupStyle, setPopupStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const gap = 6;
    const belowSpace = window.innerHeight - r.bottom - gap - 8;
    const aboveSpace = r.top - gap - 8;
    const openUp = belowSpace < 220 && aboveSpace > belowSpace;
    const maxHeight = Math.min(320, Math.max(160, openUp ? aboveSpace : belowSpace));
    setPopupStyle({
      left: r.left,
      width: r.width,
      top: openUp ? r.top - gap - maxHeight : r.bottom + gap,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopupStyle(null);
      return;
    }
    reposition();
    // Focus the search field (or the list) when opening.
    const t = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      else listRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, searchable, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, reposition]);

  // Close on outside pointer / Escape handled per-element.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep an active option in view and reset when the filtered list changes.
  useEffect(() => {
    if (!open) return;
    setActiveIndex((prev) => {
      if (filtered.length === 0) return -1;
      if (prev < 0 || prev >= filtered.length) {
        // Land on the first selectable option.
        const first = filtered.findIndex(isSelectable);
        return first === -1 ? 0 : first;
      }
      return prev;
    });
  }, [open, filtered, isSelectable]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  // ---- selection ----
  const commitSingle = (option: T) => {
    (props as SingleProps<T>).onChange(option);
    closePopup();
  };

  const toggleMulti = (option: T) => {
    const onChange = (props as MultipleProps<T>).onChange;
    const isSel = selectedValues.has(valueOf(option));
    if (isSel) {
      // Respect min: don't drop below it.
      if (min != null && selected.length <= min) {
        setAnnounce(`At least ${min} must stay selected.`);
        return;
      }
      onChange(selected.filter((s) => valueOf(s) !== valueOf(option)));
      setAnnounce(`${labelOf(option)} removed. ${selected.length - 1} selected.`);
    } else {
      if (atMax) {
        setAnnounce(`You can select at most ${max}.`);
        return;
      }
      onChange([...selected, option]);
      setAnnounce(`${labelOf(option)} added. ${selected.length + 1} selected.`);
    }
  };

  const choose = (option: T) => {
    if (!isSelectable(option) && !selectedValues.has(valueOf(option))) return;
    if (multiple) toggleMulti(option);
    else commitSingle(option);
  };

  const removeChip = (option: T) => {
    if (!multiple) return;
    if (min != null && selected.length <= min) {
      setAnnounce(`At least ${min} must stay selected.`);
      return;
    }
    (props as MultipleProps<T>).onChange(
      selected.filter((s) => valueOf(s) !== valueOf(option)),
    );
  };

  const clearAll = () => {
    if (multiple) {
      if (min != null && min > 0) return;
      (props as MultipleProps<T>).onChange([]);
    } else {
      (props as SingleProps<T>).onChange(null);
    }
  };

  // ---- keyboard ----
  const moveActive = (dir: 1 | -1) => {
    if (filtered.length === 0) return;
    setActiveIndex((prev) => {
      let next = prev;
      for (let i = 0; i < filtered.length; i++) {
        next = (next + dir + filtered.length) % filtered.length;
        if (!isOptionDisabled(filtered[next])) break;
      }
      return next;
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        openPopup();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(filtered.findIndex((o) => !isOptionDisabled(o)));
        break;
      case "End": {
        e.preventDefault();
        for (let i = filtered.length - 1; i >= 0; i--) {
          if (!isOptionDisabled(filtered[i])) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      }
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          choose(filtered[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        closePopup();
        break;
      case "Tab":
        // Let focus leave; just close.
        setOpen(false);
        setQuery("");
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  // ---- trigger content (preview) ----
  const previewCount = multiple ? props.previewCount ?? 2 : 1;
  const hasSelection = selected.length > 0;

  const triggerContent = (() => {
    if (!hasSelection) {
      return <span className="truncate text-foreground-muted">{placeholder}</span>;
    }
    if (!multiple) {
      const only = selected[0];
      return <span className="truncate text-foreground">{labelOf(only)}</span>;
    }
    const shown = selected.slice(0, previewCount);
    const overflow = selected.length - shown.length;
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {shown.map((o) => (
          <span
            key={keyOf(o)}
            className="inline-flex max-w-[12rem] items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
          >
            <span className="truncate">{labelOf(o)}</span>
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Remove ${labelOf(o)}`}
              onClick={(e) => {
                e.stopPropagation();
                removeChip(o);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  removeChip(o);
                }
              }}
              className="-mr-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded text-foreground-muted hover:bg-border hover:text-foreground"
            >
              <ClearIcon />
            </span>
          </span>
        ))}
        {overflow > 0 ? (
          <span className="text-xs font-medium text-foreground-muted">
            +{overflow}
          </span>
        ) : null}
      </span>
    );
  })();

  const canClear =
    hasSelection && !disabled && !(multiple && min != null && min > 0);

  const activeDescId =
    open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Trigger — a combobox button. */}
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeDescId}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={props["aria-invalid"]}
        disabled={disabled}
        onClick={() => (open ? closePopup() : openPopup())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex min-h-10 w-full items-center gap-2 rounded-md border border-border " +
            "bg-surface px-3 py-1.5 text-left text-sm text-foreground outline-none " +
            "transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
            "focus-visible:border-primary disabled:opacity-50 disabled:pointer-events-none",
          open && "border-primary ring-2 ring-ring",
          props["aria-invalid"] &&
            "border-danger focus-visible:border-danger focus-visible:ring-danger",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center">{triggerContent}</span>
        {canClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            <ClearIcon />
          </span>
        ) : null}
        <ChevronIcon />
      </button>

      {/* Popup */}
      {open && popupStyle ? (
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            left: popupStyle.left,
            top: popupStyle.top,
            width: popupStyle.width,
            zIndex: 50,
          }}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
        >
          {searchable ? (
            <div className="border-b border-border p-2">
              <input
                ref={searchRef}
                type="text"
                role="searchbox"
                value={query}
                placeholder={searchPlaceholder}
                aria-controls={listboxId}
                aria-activedescendant={activeDescId}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-foreground-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
              />
            </div>
          ) : null}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            tabIndex={searchable ? -1 : 0}
            onKeyDown={searchable ? undefined : onKeyDown}
            className="max-h-full flex-1 overflow-y-auto p-1 outline-none"
            style={{ maxHeight: popupStyle.maxHeight }}
          >
            {filtered.length === 0 ? (
              <li
                role="presentation"
                className="px-3 py-6 text-center text-sm text-foreground-muted"
              >
                {emptyMessage}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSel = selectedValues.has(valueOf(option));
                const isActive = index === activeIndex;
                const optDisabled =
                  isOptionDisabled(option) ||
                  (multiple && atMax && !isSel);
                return (
                  <li
                    key={keyOf(option)}
                    id={`${baseId}-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={optDisabled || undefined}
                    onPointerEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                      isActive && "bg-surface-muted",
                      isSel && "text-foreground",
                      optDisabled &&
                        "cursor-not-allowed opacity-40 hover:bg-transparent",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center">
                      {renderOption
                        ? renderOption(option, {
                            selected: isSel,
                            active: isActive,
                            disabled: optDisabled,
                          })
                        : <span className="truncate">{labelOf(option)}</span>}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-primary",
                        isSel ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    >
                      <CheckIcon />
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          {multiple && (min != null || max != null) ? (
            <div className="border-t border-border px-3 py-1.5 text-xs text-foreground-muted">
              {selected.length} selected
              {min != null ? ` · min ${min}` : ""}
              {max != null ? ` · max ${max}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* SR-only live region for selection / constraint announcements. */}
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
