"use client";

import { useTranslations } from "next-intl";
import {
  validateBlockProps,
  linkNewTabProp,
  type PropField,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import { PropFieldInput } from "./prop-field-input";
import { SpacingControls } from "./shared";
import { TranslatableField } from "./translatable-field";

/**
 * Right-rail Block tab when a COMPONENT block is selected — a settings form
 * auto-generated from the component's `propsSchema` (parsed via `parsePropsSchema`).
 *
 * Each prop renders through the SHARED `PropFieldInput` (the same type→widget
 * mapping the Develop workbench uses), except TRANSLATABLE string/richtext props
 * (`translatable:true`), which render one input PER content locale (mirrors the
 * SEO tab) and write a `{loc:text}` object via `setLocalizedProp`. Every edit
 * re-validates the full props through `validateBlockProps` (the schema overload —
 * type coercion + required-prop retention) and hands the parent the persistable
 * props; the existing top-bar Save writes them. All PURE prop-merge logic lives
 * in `page-blocks.ts` — never duplicated here.
 */
export function ComponentSettings({
  block,
  schema,
  locales,
  onChange,
  hasDraft = false,
}: {
  block: Block;
  schema: PropField[];
  locales: string[];
  onChange: (props: Record<string, unknown>) => void;
  /** The block's component has an unpublished draft (preview ≠ public render). */
  hasDraft?: boolean;
}) {
  const t = useTranslations("pageBuilder");
  const props = (block.props ?? {}) as Record<string, unknown>;

  const heading = (
    <p className="font-mono text-sm text-foreground">
      {block.component}
      {hasDraft && (
        <span
          className="ml-1.5 rounded border border-warning bg-warning-subtle px-1 py-px align-middle font-sans text-[10px] font-medium uppercase tracking-wide text-foreground"
          title={t("draftBadgeHint")}
        >
          {t("draftBadge")}
        </span>
      )}
    </p>
  );

  const segLabel = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg = "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  // Apply one field's new raw value, then re-validate the WHOLE props by schema so
  // types coerce and required props stay present (width is a reserved layout prop,
  // preserved through validation).
  function setField(name: string, value: unknown) {
    onChange(validateBlockProps({ ...props, [name]: value }, schema));
  }
  // Per-block layout width: fill the column vs wrap to content (default fill).
  const width: "fill" | "auto" = props.width === "auto" ? "auto" : "fill";
  function setWidth(w: "fill" | "auto") {
    onChange(validateBlockProps({ ...props, width: w }, schema));
  }

  // Standard layout controls at the top of EVERY component block's editor:
  // width toggle (fill column vs wrap content) + per-side padding/margin.
  const layoutControls = (
    <>
      <div className="flex flex-col gap-1.5">
        <span className={segLabel}>{t("blockWidth.label")}</span>
        <div className="flex gap-1">
          {(["fill", "auto"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              aria-pressed={width === w}
              className={`${seg} ${width === w ? segOn : segOff}`}
            >
              {t(`blockWidth.${w}`)}
            </button>
          ))}
        </div>
      </div>
      <SpacingControls
        props={props}
        onPatch={(patch) => onChange(validateBlockProps({ ...props, ...patch }, schema))}
      />
    </>
  );

  if (schema.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        {layoutControls}
        <p className="text-sm text-foreground-muted">{t("componentNoProps")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {heading}
      {layoutControls}
      {schema.map((f) => {
        // Translatable text → its own per-locale field (lang tabs + AI translate).
        if (f.translatable) {
          return (
            <TranslatableField
              key={f.name}
              field={f}
              block={block}
              props={props}
              locales={locales}
              onChange={onChange}
            />
          );
        }

        return (
          <PropFieldInput
            key={f.name}
            field={f}
            value={props[f.name]}
            newTabValue={props[linkNewTabProp(f.name)]}
            onValue={(v) => setField(f.name, v)}
            onNewTab={(on) => setField(linkNewTabProp(f.name), on)}
          />
        );
      })}
    </div>
  );
}
