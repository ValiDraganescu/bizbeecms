import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ui";
import { DesignSystemNav, type NavItem } from "@/components/design-system/nav";
import {
  Item,
  Mono,
  Section,
  Specimen,
  Swatch,
} from "@/components/design-system/specimen";
import {
  LoadingButtonDemo,
  ValidationFieldDemo,
} from "@/components/design-system/interactive-demos";
import {
  CustomPredicateAndItemDemo,
  DisabledComboboxDemo,
  DisabledOptionDemo,
  MinMaxDemo,
  MultiPreviewDemo,
  SearchableSingleDemo,
  SingleSelectDemo,
} from "@/components/design-system/combobox-demos";

export const metadata: Metadata = {
  title: "Design System — bizbeecms ProjectManager",
  description:
    "The bizbeecms ProjectManager component reference: foundations, components, states, and configs.",
};

const NAV: NavItem[] = [
  { id: "foundations", label: "Foundations" },
  { id: "buttons", label: "Buttons" },
  { id: "inputs", label: "Inputs" },
  { id: "combobox", label: "Combobox" },
  { id: "badges", label: "Status badges" },
  { id: "alerts", label: "Alerts" },
  { id: "card", label: "Card" },
  { id: "table", label: "Table" },
];

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-surface text-foreground">
      {/* Page header — sticky so the theme toggle stays reachable while the
          catalog scrolls. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              bb
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">
                bizbeecms · Design System
              </span>
              <span className="truncate text-xs text-foreground-muted">
                ProjectManager component reference
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Side menu */}
        <aside className="md:sticky md:top-[4.75rem] md:h-[calc(100vh-6rem)] md:self-start md:overflow-y-auto md:pr-2">
          <DesignSystemNav items={NAV} />
        </aside>

        {/* Detail panel */}
        <main className="flex min-w-0 flex-col gap-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Design system
            </h1>
            <p className="max-w-2xl text-sm text-foreground-muted">
              The building blocks of the ProjectManager. Every component is
              shown across its sizes, states, and configurations. Toggle the
              theme above to audit each one in light and dark — all colors
              resolve from purpose-named tokens.
            </p>
          </div>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="foundations"
            title="Foundations"
            description="The purpose-named token palette. Components reference these by role (bg-primary, text-foreground), never by raw color."
          >
            <Specimen
              label="Surface & text"
              hint="Backgrounds, foreground text, borders."
            >
              <Swatch name="Surface" utility="bg-surface" className="bg-surface" ring />
              <Swatch
                name="Surface muted"
                utility="bg-surface-muted"
                className="bg-surface-muted"
                ring
              />
              <Swatch
                name="Surface raised"
                utility="bg-surface-raised"
                className="bg-surface-raised"
                ring
              />
              <Swatch
                name="Foreground"
                utility="bg-foreground"
                className="bg-foreground"
              />
              <Swatch
                name="Foreground muted"
                utility="bg-foreground-muted"
                className="bg-foreground-muted"
              />
              <Swatch name="Border" utility="bg-border" className="bg-border" />
            </Specimen>

            <Specimen
              label="Accent & status"
              hint="The indigo accent is used sparingly. Status colors always travel with an icon or label."
            >
              <Swatch
                name="Primary"
                utility="bg-primary"
                className="bg-primary"
              />
              <Swatch
                name="Success"
                utility="bg-success"
                className="bg-success"
              />
              <Swatch
                name="Warning"
                utility="bg-warning"
                className="bg-warning"
              />
              <Swatch
                name="Danger"
                utility="bg-danger"
                className="bg-danger"
              />
              <Swatch name="Info" utility="bg-info" className="bg-info" />
            </Specimen>

            <Specimen label="Type scale" hint="One sans across weights; mono for machine data.">
              <div className="flex w-full flex-col gap-3">
                <p className="text-2xl font-semibold tracking-tight">
                  Display / page title{" "}
                  <Mono>text-2xl font-semibold</Mono>
                </p>
                <p className="text-xl font-semibold tracking-tight">
                  Headline <Mono>text-xl font-semibold</Mono>
                </p>
                <p className="text-base font-medium">
                  Title <Mono>text-base font-medium</Mono>
                </p>
                <p className="text-sm text-foreground">
                  Body — the default reading size for descriptions and helper
                  copy. <Mono>text-sm</Mono>
                </p>
                <p className="text-xs text-foreground-muted">
                  Label / caption <Mono>text-xs text-foreground-muted</Mono>
                </p>
                <p
                  className="text-sm text-foreground-muted"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  bizbeecms-cms-helsinki · FI · deploy_01H9 <Mono>font-mono</Mono>
                </p>
              </div>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="buttons"
            title="Buttons"
            description="Four variants, three sizes. Active nudges down; focus shows a ring; loading blocks interaction and keeps its width."
          >
            <Specimen label="Variants" hint={<Mono>variant</Mono>}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </Specimen>

            <Specimen label="Sizes" hint={<Mono>size=&quot;sm | md | lg&quot;</Mono>}>
              <Item label="sm">
                <Button size="sm">Small</Button>
              </Item>
              <Item label="md (default)">
                <Button size="md">Medium</Button>
              </Item>
              <Item label="lg">
                <Button size="lg">Large</Button>
              </Item>
            </Specimen>

            <Specimen label="States" hint="Hover & focus are interactive — try the keyboard.">
              <Item label="default">
                <Button>Save</Button>
              </Item>
              <Item label="disabled">
                <Button disabled>Save</Button>
              </Item>
              <Item label="loading">
                <Button loading>Save</Button>
              </Item>
              <LoadingButtonDemo />
            </Specimen>

            <Specimen label="With icon" hint="Children compose freely.">
              <Button variant="primary">
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
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Continue
              </Button>
              <Button variant="secondary">
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
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New site
              </Button>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="inputs"
            title="Inputs"
            description="Composed structurally with Field + Label + Hint/Error. Controls share one focus treatment."
          >
            <Specimen label="Text, select, textarea" className="items-start">
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-email">Email</FieldLabel>
                <Input id="ds-email" type="email" placeholder="you@example.com" />
                <FieldHint>Used for sign-in and invites.</FieldHint>
              </Field>
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-role">Role</FieldLabel>
                <Select id="ds-role" defaultValue="Admin">
                  <option value="SuperAdmin">SuperAdmin</option>
                  <option value="Admin">Admin</option>
                  <option value="SiteManager">SiteManager</option>
                </Select>
                <FieldHint>Scopes what this user can do.</FieldHint>
              </Field>
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-notes">Notes</FieldLabel>
                <Textarea id="ds-notes" placeholder="Optional context…" />
              </Field>
            </Specimen>

            <Specimen label="States" className="items-start">
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-disabled">Disabled</FieldLabel>
                <Input id="ds-disabled" value="locked@bizbee.example" disabled readOnly />
                <FieldHint>Managed by SSO.</FieldHint>
              </Field>
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-error">Error</FieldLabel>
                <Input
                  id="ds-error"
                  defaultValue="bad"
                  aria-invalid
                  aria-describedby="ds-error-msg"
                  className="border-danger focus-visible:border-danger focus-visible:ring-danger"
                />
                <FieldError id="ds-error-msg">Slug already in use.</FieldError>
              </Field>
              <ValidationFieldDemo />
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="combobox"
            title="Combobox"
            description="A custom, controlled, accessible select: searchable, single or multiple, min/max selected, custom item UI, custom search predicate, and a configurable selected-items preview."
          >
            <Specimen
              label="Single & searchable"
              hint="Default {id,label} options, or a custom item type via accessors."
              className="items-start"
            >
              <SingleSelectDemo />
              <SearchableSingleDemo />
            </Specimen>

            <Specimen
              label="Multiple with preview"
              hint={<Mono>multiple · previewCount</Mono>}
              className="items-start"
            >
              <MultiPreviewDemo />
              <MinMaxDemo />
            </Specimen>

            <Specimen
              label="Custom predicate & item UI"
              hint={<Mono>filterOption · renderOption</Mono>}
              className="items-start"
            >
              <CustomPredicateAndItemDemo />
            </Specimen>

            <Specimen label="States" className="items-start">
              <DisabledOptionDemo />
              <DisabledComboboxDemo />
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="badges"
            title="Status badges"
            description="Tone + glyph + label. Status meaning never relies on color alone, so a color-blind operator reads it correctly."
          >
            <Specimen label="Site & deploy status" hint="Subtle variant (default).">
              <Badge tone="success">Live</Badge>
              <Badge tone="info">Deploying</Badge>
              <Badge tone="warning">Needs review</Badge>
              <Badge tone="danger">Failed</Badge>
              <Badge tone="primary">Current</Badge>
              <Badge tone="neutral">Draft</Badge>
            </Specimen>

            <Specimen label="Variants" hint={<Mono>variant=&quot;subtle | solid | outline&quot;</Mono>}>
              <Item label="subtle">
                <Badge tone="success" variant="subtle">
                  Live
                </Badge>
              </Item>
              <Item label="solid">
                <Badge tone="success" variant="solid">
                  Live
                </Badge>
              </Item>
              <Item label="outline">
                <Badge tone="success" variant="outline">
                  Live
                </Badge>
              </Item>
            </Specimen>

            <Specimen label="Roles" hint="Plain counts and tags use the neutral tone with no dot.">
              <Badge tone="primary" dot={false}>
                SuperAdmin
              </Badge>
              <Badge tone="neutral" dot={false}>
                Admin
              </Badge>
              <Badge tone="neutral" dot={false}>
                SiteManager
              </Badge>
              <Badge tone="neutral" dot={false}>
                12 sites
              </Badge>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="alerts"
            title="Alerts"
            description="Inline feedback. Tinted surface, leading icon, title + body. Flat — a 1px border, no shadow."
          >
            <Specimen label="Tones" className="flex-col items-stretch">
              <Alert tone="info" className="w-full">
                <AlertTitle>Deploy queued</AlertTitle>
                <AlertBody>
                  The Worker build for <strong>helsinki</strong> started a moment
                  ago. This usually takes under a minute.
                </AlertBody>
              </Alert>
              <Alert tone="success" className="w-full">
                <AlertTitle>Site published</AlertTitle>
                <AlertBody>
                  bizbeecms-cms-helsinki is live on Cloudflare.
                </AlertBody>
              </Alert>
              <Alert tone="warning" className="w-full">
                <AlertTitle>D1 binding is a placeholder</AlertTitle>
                <AlertBody>
                  Replace the placeholder database id in wrangler.jsonc before
                  the next production deploy.
                </AlertBody>
              </Alert>
              <Alert tone="danger" className="w-full">
                <AlertTitle>Deploy failed</AlertTitle>
                <AlertBody>
                  The Cloudflare API returned 403. Re-authenticate and retry.
                </AlertBody>
              </Alert>
            </Specimen>

            <Specimen label="Title only" className="flex-col items-stretch">
              <Alert tone="info" className="w-full">
                <AlertTitle>3 invites are still pending.</AlertTitle>
              </Alert>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="card"
            title="Card"
            description="A flat container: 1px border on a raised surface. Header / content / footer compose as needed."
          >
            <Specimen label="Full composition" className="items-stretch">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle>Invite a teammate</CardTitle>
                  <CardDescription>
                    They&apos;ll get an email to join this Site.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor="ds-card-email">Email</FieldLabel>
                    <Input
                      id="ds-card-email"
                      type="email"
                      placeholder="teammate@agency.com"
                    />
                  </Field>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                  <Button size="sm">Send invite</Button>
                </CardFooter>
              </Card>

              <Card className="w-full max-w-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>helsinki</CardTitle>
                    <Badge tone="success">Live</Badge>
                  </div>
                  <CardDescription>bizbeecms-cms-helsinki · FI</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground-muted">
                    Last deployed 4 minutes ago · 2 site managers.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button variant="secondary" size="sm">
                    Open
                  </Button>
                  <Button variant="ghost" size="sm">
                    Deploy
                  </Button>
                </CardFooter>
              </Card>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="table"
            title="Table"
            description="Composable table primitives. Rows hover; status reads through a badge, not row color."
          >
            <Specimen label="Users" className="block p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>ada@bizbee.example</TableCell>
                    <TableCell>
                      <Badge tone="primary" dot={false}>
                        SuperAdmin
                      </Badge>
                    </TableCell>
                    <TableCell>FI</TableCell>
                    <TableCell>
                      <Badge tone="success">Active</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>liis@bizbee.example</TableCell>
                    <TableCell>
                      <Badge tone="neutral" dot={false}>
                        Admin
                      </Badge>
                    </TableCell>
                    <TableCell>EE</TableCell>
                    <TableCell>
                      <Badge tone="success">Active</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>juhan@bizbee.example</TableCell>
                    <TableCell>
                      <Badge tone="neutral" dot={false}>
                        SiteManager
                      </Badge>
                    </TableCell>
                    <TableCell>EE</TableCell>
                    <TableCell>
                      <Badge tone="info">Invited</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Specimen>
          </Section>
        </main>
      </div>
    </div>
  );
}
