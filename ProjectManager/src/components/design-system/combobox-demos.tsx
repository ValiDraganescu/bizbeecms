"use client";

import { useState } from "react";
import {
  Badge,
  Combobox,
  Field,
  FieldHint,
  FieldLabel,
  type DefaultOption,
} from "@/components/ui";
import { Caption } from "./specimen";

/**
 * Live demos for the Combobox section of the design system. Each is controlled
 * (value + onChange) per the component's contract, so they exercise the real
 * single / multiple / min-max / search / custom-item code paths.
 */

// --- Default-shape options ({id, label}) ---
const ROLES: DefaultOption[] = [
  { id: "superadmin", label: "SuperAdmin" },
  { id: "admin", label: "Admin" },
  { id: "sitemanager", label: "SiteManager" },
];

// --- Custom item type T (no {id,label} shape) — exercises accessors + renderOption ---
type Country = {
  code: string;
  name: string;
  region: string;
  flag: string;
};

const COUNTRIES: Country[] = [
  { code: "FI", name: "Finland", region: "Nordics", flag: "🇫🇮" },
  { code: "EE", name: "Estonia", region: "Baltics", flag: "🇪🇪" },
  { code: "SE", name: "Sweden", region: "Nordics", flag: "🇸🇪" },
  { code: "LV", name: "Latvia", region: "Baltics", flag: "🇱🇻" },
  { code: "LT", name: "Lithuania", region: "Baltics", flag: "🇱🇹" },
  { code: "NO", name: "Norway", region: "Nordics", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", region: "Nordics", flag: "🇩🇰" },
  { code: "DE", name: "Germany", region: "DACH", flag: "🇩🇪" },
];

export function SingleSelectDemo() {
  const [role, setRole] = useState<DefaultOption | null>(ROLES[1]);
  return (
    <Field className="w-full max-w-xs">
      <FieldLabel htmlFor="ds-cb-single">Role</FieldLabel>
      <Combobox
        id="ds-cb-single"
        options={ROLES}
        value={role}
        onChange={setRole}
        searchable={false}
        placeholder="Pick a role…"
      />
      <FieldHint>Single select, no search.</FieldHint>
    </Field>
  );
}

export function SearchableSingleDemo() {
  const [country, setCountry] = useState<Country | null>(COUNTRIES[0]);
  return (
    <Field className="w-full max-w-xs">
      <FieldLabel htmlFor="ds-cb-search">Country</FieldLabel>
      <Combobox<Country>
        id="ds-cb-search"
        options={COUNTRIES}
        value={country}
        onChange={setCountry}
        getOptionValue={(c) => c.code}
        getOptionLabel={(c) => c.name}
        searchPlaceholder="Search countries…"
        placeholder="Pick a country…"
      />
      <FieldHint>
        Searchable, custom item type via accessors (label = name).
      </FieldHint>
    </Field>
  );
}

export function MultiPreviewDemo() {
  const [countries, setCountries] = useState<Country[]>([
    COUNTRIES[0],
    COUNTRIES[1],
    COUNTRIES[2],
  ]);
  return (
    <Field className="w-full max-w-xs">
      <FieldLabel htmlFor="ds-cb-multi">Scope to countries</FieldLabel>
      <Combobox<Country>
        id="ds-cb-multi"
        multiple
        options={COUNTRIES}
        value={countries}
        onChange={setCountries}
        getOptionValue={(c) => c.code}
        getOptionLabel={(c) => c.name}
        previewCount={2}
        searchPlaceholder="Search countries…"
        placeholder="All countries"
      />
      <FieldHint>
        Multi-select. Preview shows 2 chips, then “+N”.
      </FieldHint>
    </Field>
  );
}

export function MinMaxDemo() {
  const [countries, setCountries] = useState<Country[]>([
    COUNTRIES[0],
    COUNTRIES[1],
  ]);
  return (
    <Field className="w-full max-w-xs">
      <FieldLabel htmlFor="ds-cb-minmax">Assigned regions</FieldLabel>
      <Combobox<Country>
        id="ds-cb-minmax"
        multiple
        options={COUNTRIES}
        value={countries}
        onChange={setCountries}
        getOptionValue={(c) => c.code}
        getOptionLabel={(c) => c.name}
        min={1}
        max={3}
        previewCount={3}
        searchPlaceholder="Search countries…"
      />
      <FieldHint>min 1 · max 3 — try removing all, or adding a 4th.</FieldHint>
    </Field>
  );
}

export function CustomPredicateAndItemDemo() {
  const [countries, setCountries] = useState<Country[]>([COUNTRIES[1]]);
  return (
    <Field className="w-full max-w-sm">
      <FieldLabel htmlFor="ds-cb-custom">Countries (rich items)</FieldLabel>
      <Combobox<Country>
        id="ds-cb-custom"
        multiple
        options={COUNTRIES}
        value={countries}
        onChange={setCountries}
        getOptionValue={(c) => c.code}
        getOptionLabel={(c) => c.name}
        // Custom predicate: match name, ISO code, OR region.
        filterOption={(c, q) => {
          const t = q.toLowerCase();
          return (
            c.name.toLowerCase().includes(t) ||
            c.code.toLowerCase().includes(t) ||
            c.region.toLowerCase().includes(t)
          );
        }}
        // Custom item UI: flag + name + region, with a mono ISO code.
        renderOption={(c) => (
          <span className="flex w-full items-center gap-2.5">
            <span aria-hidden="true" className="text-base leading-none">
              {c.flag}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-foreground">{c.name}</span>
              <span className="truncate text-xs text-foreground-muted">
                {c.region}
              </span>
            </span>
            <Badge tone="neutral" dot={false} className="ml-auto">
              {c.code}
            </Badge>
          </span>
        )}
        previewCount={2}
        searchPlaceholder="Search name, code, or region…"
      />
      <FieldHint>
        Custom search predicate (try “bal” or “ee”) + custom item UI.
      </FieldHint>
    </Field>
  );
}

export function DisabledComboboxDemo() {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="w-full max-w-xs">
        <Combobox<DefaultOption>
          options={[]}
          value={null}
          onChange={() => {}}
          disabled
          placeholder="Disabled"
        />
      </div>
      <Caption>disabled</Caption>
    </div>
  );
}

export function DisabledOptionDemo() {
  const [role, setRole] = useState<DefaultOption | null>(null);
  const roles: DefaultOption[] = [
    { id: "superadmin", label: "SuperAdmin" },
    { id: "admin", label: "Admin" },
    { id: "sitemanager", label: "SiteManager" },
  ];
  return (
    <div className="flex flex-col items-start gap-2">
      <Field className="w-full max-w-xs">
        <FieldLabel htmlFor="ds-cb-disabledopt">Invite as</FieldLabel>
        <Combobox<DefaultOption>
          id="ds-cb-disabledopt"
          options={roles}
          value={role}
          onChange={setRole}
          searchable={false}
          // SuperAdmin can't be invited — only the first user becomes one.
          getOptionDisabled={(r) => r.id === "superadmin"}
          placeholder="Pick a role…"
        />
      </Field>
      <Caption>SuperAdmin option is disabled</Caption>
    </div>
  );
}
