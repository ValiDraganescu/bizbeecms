"use client";

/**
 * The right rail's BLOCK tab body, extracted from page-builder-shell.tsx: the
 * node-kind switch that renders the right settings panel for the selected node
 * (Section / column / row / List / Form / GuestChat / component leaf), or the
 * empty hint when nothing is selected. Pure dispatch — every edit goes through
 * the `BlockEditor` handlers; all the data props are the shell's loaded
 * palette/binding metadata.
 */

import { useTranslations } from "next-intl";
import {
  findBlock,
  isSection,
  isSectionColumn,
  isSectionRow,
  isList,
  isForm,
  isGuestChat,
  parsePropsSchema,
} from "@/lib/pages/page-blocks";
import { declaredPropNames } from "@/lib/content/binding";
import type { CollectionMeta, ApiSourceMeta } from "@/lib/page-builder/types";
import { ColumnSettings } from "./column-settings";
import { SectionSettings } from "./section-settings";
import { RowSettings } from "./row-settings";
import { ComponentSettings } from "./component-settings";
import { BindingPanel, ListSettings, FormSettings } from "./binding-panels";
import { GuestChatSettings } from "./guest-chat-settings";
import type { BlockEditor } from "./use-block-editor";

export function BlockInspector({
  editor,
  collections,
  apiSources,
  propsSchemas,
  draftComponents,
  locales,
}: {
  editor: BlockEditor;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  /** name → raw propsSchema JSON (drives the schema-driven settings form). */
  propsSchemas: Record<string, string | null>;
  /** Components with an unpublished DRAFT — drives the inspector "draft" badge. */
  draftComponents: Set<string>;
  /** Site content locales, default (source) first. */
  locales: string[];
}) {
  const t = useTranslations("pageBuilder");

  // Selected node can be nested (a component inside a column), so tree-walk —
  // a top-level find would miss it.
  const sel = editor.selectedBlockId ? findBlock(editor.blocks, editor.selectedBlockId) : null;

  if (sel && isSection(sel)) {
    return (
      <SectionSettings
        key={sel.id}
        section={sel}
        onChange={(patch) => editor.onUpdateSection(sel.id, patch)}
      />
    );
  }
  // A column shell: show its own settings (per-viewport visibility).
  if (sel && isSectionColumn(sel)) {
    return (
      <ColumnSettings
        key={sel.id}
        column={sel}
        onChange={(patch) => editor.onPatchBlockProps(sel.id, patch)}
      />
    );
  }
  // A built-in List block: query + per-row template mapping panel.
  if (sel && isList(sel)) {
    return (
      <ListSettings
        key={sel.id}
        block={sel}
        collections={collections}
        apiSources={apiSources}
        propsSchemas={propsSchemas}
        locales={locales}
        onChange={(patch) => editor.onUpdateList(sel.id, patch)}
        onProps={(patch) => editor.onPatchBlockProps(sel.id, patch)}
        // The TEMPLATE child's props — the T7 updater path (updateBlockProps
        // tree-walks to the nested template block), so async translate results
        // merge against its LATEST props.
        onTemplateProps={editor.onUpdateComponentProps}
      />
    );
  }
  // A built-in Form block: target + messages/redirect + content panel.
  if (sel && isForm(sel)) {
    return (
      <FormSettings
        key={sel.id}
        block={sel}
        collections={collections}
        apiSources={apiSources}
        propsSchemas={propsSchemas}
        onChange={(patch) => editor.onUpdateForm(sel.id, patch)}
        onProps={(patch) => editor.onPatchBlockProps(sel.id, patch)}
      />
    );
  }
  // A built-in GuestChat leaf: agent picker + mode + copy panel.
  if (sel && isGuestChat(sel)) {
    return (
      <GuestChatSettings
        key={sel.id}
        block={sel}
        onProps={(patch) => editor.onPatchBlockProps(sel.id, patch)}
      />
    );
  }
  // A ROW shell: its own settings (behavior, gap, align, background, padding).
  // Column COUNT stays inline on the row in the Layers tree.
  if (sel && isSectionRow(sel)) {
    return (
      <RowSettings
        key={sel.id}
        row={sel}
        onChange={(patch) => editor.onUpdateRowProps(sel.id, patch)}
      />
    );
  }
  // A component block (not a Section, row, or column shell): show its
  // schema-driven settings form + the single-item binding panel.
  if (sel && !isSectionColumn(sel)) {
    return (
      <div className="space-y-6">
        <ComponentSettings
          key={sel.id}
          block={sel}
          hasDraft={draftComponents.has(sel.component)}
          schema={parsePropsSchema(propsSchemas[sel.component])}
          locales={locales}
          onChange={(props) => editor.onUpdateComponentProps(sel.id, props)}
        />
        <BindingPanel
          key={`bind-${sel.id}`}
          block={sel}
          collections={collections}
          apiSources={apiSources}
          declared={[...declaredPropNames(propsSchemas[sel.component])]}
          onChange={(bindings) => editor.onUpdateBlockField(sel.id, { bindings })}
        />
      </div>
    );
  }
  return <p className="text-sm text-foreground-muted">{t("blockEmpty")}</p>;
}
