import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("designSystem");
  const tApp = await getTranslations("app");
  return {
    title: `${t("headerTitle")} — ${tApp("name")} ${tApp("projectManager")}`,
    description: t("intro"),
  };
}

export default function DesignSystemPage() {
  const t = useTranslations("designSystem");
  const tApp = useTranslations("app");

  const nav: NavItem[] = [
    { id: "foundations", label: t("nav.foundations") },
    { id: "buttons", label: t("nav.buttons") },
    { id: "inputs", label: t("nav.inputs") },
    { id: "combobox", label: t("nav.combobox") },
    { id: "badges", label: t("nav.badges") },
    { id: "alerts", label: t("nav.alerts") },
    { id: "card", label: t("nav.card") },
    { id: "table", label: t("nav.table") },
  ];

  return (
    <div className="min-h-screen bg-surface text-foreground">
      {/* Page header — sticky so the controls stay reachable while the catalog
          scrolls. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              bb
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">
                {tApp("name")} · {t("headerTitle")}
              </span>
              <span className="truncate text-xs text-foreground-muted">
                {t("headerSubtitle")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Side menu */}
        <aside className="md:sticky md:top-[4.75rem] md:h-[calc(100vh-6rem)] md:self-start md:overflow-y-auto md:pr-2">
          <DesignSystemNav items={nav} heading={t("navHeading")} />
        </aside>

        {/* Detail panel */}
        <main className="flex min-w-0 flex-col gap-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-sm text-foreground-muted">
              {t("intro")}
            </p>
          </div>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="foundations"
            title={t("foundations.title")}
            description={t("foundations.description")}
          >
            <Specimen
              label={t("foundations.surfaceText")}
              hint={t("foundations.surfaceTextHint")}
            >
              <Swatch name={t("foundations.swatch.surface")} utility="bg-surface" className="bg-surface" ring />
              <Swatch name={t("foundations.swatch.surfaceMuted")} utility="bg-surface-muted" className="bg-surface-muted" ring />
              <Swatch name={t("foundations.swatch.surfaceRaised")} utility="bg-surface-raised" className="bg-surface-raised" ring />
              <Swatch name={t("foundations.swatch.foreground")} utility="bg-foreground" className="bg-foreground" />
              <Swatch name={t("foundations.swatch.foregroundMuted")} utility="bg-foreground-muted" className="bg-foreground-muted" />
              <Swatch name={t("foundations.swatch.border")} utility="bg-border" className="bg-border" />
            </Specimen>

            <Specimen
              label={t("foundations.accentStatus")}
              hint={t("foundations.accentStatusHint")}
            >
              <Swatch name={t("foundations.swatch.primary")} utility="bg-primary" className="bg-primary" />
              <Swatch name={t("foundations.swatch.success")} utility="bg-success" className="bg-success" />
              <Swatch name={t("foundations.swatch.warning")} utility="bg-warning" className="bg-warning" />
              <Swatch name={t("foundations.swatch.danger")} utility="bg-danger" className="bg-danger" />
              <Swatch name={t("foundations.swatch.info")} utility="bg-info" className="bg-info" />
            </Specimen>

            <Specimen label={t("foundations.typeScale")} hint={t("foundations.typeScaleHint")}>
              <div className="flex w-full flex-col gap-3">
                <p className="text-2xl font-semibold tracking-tight">
                  {t("foundations.type.display")} <Mono>text-2xl font-semibold</Mono>
                </p>
                <p className="text-xl font-semibold tracking-tight">
                  {t("foundations.type.headline")} <Mono>text-xl font-semibold</Mono>
                </p>
                <p className="text-base font-medium">
                  {t("foundations.type.titleRow")} <Mono>text-base font-medium</Mono>
                </p>
                <p className="text-sm text-foreground">
                  {t("foundations.type.body")} <Mono>text-sm</Mono>
                </p>
                <p className="text-xs text-foreground-muted">
                  {t("foundations.type.label")} <Mono>text-xs text-foreground-muted</Mono>
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
            title={t("buttons.title")}
            description={t("buttons.description")}
          >
            <Specimen label={t("buttons.variants")} hint={<Mono>variant</Mono>}>
              <Button variant="primary">{t("buttons.primary")}</Button>
              <Button variant="secondary">{t("buttons.secondary")}</Button>
              <Button variant="ghost">{t("buttons.ghost")}</Button>
              <Button variant="danger">{t("buttons.danger")}</Button>
            </Specimen>

            <Specimen label={t("buttons.sizes")} hint={<Mono>size=&quot;sm | md | lg&quot;</Mono>}>
              <Item label={t("buttons.sizeSm")}>
                <Button size="sm">{t("buttons.sizeSmall")}</Button>
              </Item>
              <Item label={t("buttons.sizeMdDefault")}>
                <Button size="md">{t("buttons.sizeMedium")}</Button>
              </Item>
              <Item label={t("buttons.sizeLg")}>
                <Button size="lg">{t("buttons.sizeLarge")}</Button>
              </Item>
            </Specimen>

            <Specimen label={t("buttons.states")} hint={t("buttons.statesHint")}>
              <Item label={t("buttons.stateDefault")}>
                <Button>{t("buttons.save")}</Button>
              </Item>
              <Item label={t("buttons.stateDisabled")}>
                <Button disabled>{t("buttons.save")}</Button>
              </Item>
              <Item label={t("buttons.stateLoading")}>
                <Button loading>{t("buttons.save")}</Button>
              </Item>
              <LoadingButtonDemo />
            </Specimen>

            <Specimen label={t("buttons.withIcon")} hint={t("buttons.withIconHint")}>
              <Button variant="primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                {t("buttons.continue")}
              </Button>
              <Button variant="secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t("buttons.newSite")}
              </Button>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="inputs"
            title={t("inputs.title")}
            description={t("inputs.description")}
          >
            <Specimen label={t("inputs.textSelectTextarea")} className="items-start">
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-email">{t("inputs.email")}</FieldLabel>
                <Input id="ds-email" type="email" placeholder="you@example.com" />
                <FieldHint>{t("inputs.emailHint")}</FieldHint>
              </Field>
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-role">{t("inputs.role")}</FieldLabel>
                <Select id="ds-role" defaultValue="Admin">
                  <option value="SuperAdmin">SuperAdmin</option>
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Editor">Editor</option>
                </Select>
                <FieldHint>{t("inputs.roleHint")}</FieldHint>
              </Field>
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-notes">{t("inputs.notes")}</FieldLabel>
                <Textarea id="ds-notes" placeholder={t("inputs.notesPlaceholder")} />
              </Field>
            </Specimen>

            <Specimen label={t("inputs.states")} className="items-start">
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-disabled">{t("inputs.disabled")}</FieldLabel>
                <Input id="ds-disabled" value="locked@bizbee.example" disabled readOnly />
                <FieldHint>{t("inputs.disabledHint")}</FieldHint>
              </Field>
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="ds-error">{t("inputs.error")}</FieldLabel>
                <Input
                  id="ds-error"
                  defaultValue="bad"
                  aria-invalid
                  aria-describedby="ds-error-msg"
                  className="border-danger focus-visible:border-danger focus-visible:ring-danger"
                />
                <FieldError id="ds-error-msg">{t("inputs.errorMessage")}</FieldError>
              </Field>
              <ValidationFieldDemo />
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="combobox"
            title={t("combobox.title")}
            description={t("combobox.description")}
          >
            <Specimen
              label={t("combobox.singleSearchable")}
              hint={t("combobox.singleSearchableHint")}
              className="items-start"
            >
              <SingleSelectDemo />
              <SearchableSingleDemo />
            </Specimen>

            <Specimen
              label={t("combobox.multiPreview")}
              hint={<Mono>multiple · previewCount</Mono>}
              className="items-start"
            >
              <MultiPreviewDemo />
              <MinMaxDemo />
            </Specimen>

            <Specimen
              label={t("combobox.customPredicate")}
              hint={<Mono>filterOption · renderOption</Mono>}
              className="items-start"
            >
              <CustomPredicateAndItemDemo />
            </Specimen>

            <Specimen label={t("combobox.states")} className="items-start">
              <DisabledOptionDemo />
              <DisabledComboboxDemo />
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="badges"
            title={t("badges.title")}
            description={t("badges.description")}
          >
            <Specimen label={t("badges.siteDeploy")} hint={t("badges.siteDeployHint")}>
              <Badge tone="success">{t("badges.live")}</Badge>
              <Badge tone="info">{t("badges.deploying")}</Badge>
              <Badge tone="warning">{t("badges.needsReview")}</Badge>
              <Badge tone="danger">{t("badges.failed")}</Badge>
              <Badge tone="primary">{t("badges.current")}</Badge>
              <Badge tone="neutral">{t("badges.draft")}</Badge>
            </Specimen>

            <Specimen label={t("badges.variants")} hint={<Mono>variant=&quot;subtle | solid | outline&quot;</Mono>}>
              <Item label="subtle">
                <Badge tone="success" variant="subtle">{t("badges.live")}</Badge>
              </Item>
              <Item label="solid">
                <Badge tone="success" variant="solid">{t("badges.live")}</Badge>
              </Item>
              <Item label="outline">
                <Badge tone="success" variant="outline">{t("badges.live")}</Badge>
              </Item>
            </Specimen>

            <Specimen label={t("badges.roles")} hint={t("badges.rolesHint")}>
              <Badge tone="primary" dot={false}>SuperAdmin</Badge>
              <Badge tone="neutral" dot={false}>Admin</Badge>
              <Badge tone="neutral" dot={false}>Manager</Badge>
              <Badge tone="neutral" dot={false}>Editor</Badge>
              <Badge tone="neutral" dot={false}>{t("badges.sites", { count: 12 })}</Badge>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="alerts"
            title={t("alerts.title")}
            description={t("alerts.description")}
          >
            <Specimen label={t("alerts.tones")} className="flex-col items-stretch">
              <Alert tone="info" className="w-full">
                <AlertTitle>{t("alerts.deployQueuedTitle")}</AlertTitle>
                <AlertBody>
                  {t.rich("alerts.deployQueuedBody", {
                    b: (chunks) => <strong>{chunks}</strong>,
                  })}
                </AlertBody>
              </Alert>
              <Alert tone="success" className="w-full">
                <AlertTitle>{t("alerts.publishedTitle")}</AlertTitle>
                <AlertBody>{t("alerts.publishedBody")}</AlertBody>
              </Alert>
              <Alert tone="warning" className="w-full">
                <AlertTitle>{t("alerts.warningTitle")}</AlertTitle>
                <AlertBody>{t("alerts.warningBody")}</AlertBody>
              </Alert>
              <Alert tone="danger" className="w-full">
                <AlertTitle>{t("alerts.failedTitle")}</AlertTitle>
                <AlertBody>{t("alerts.failedBody")}</AlertBody>
              </Alert>
            </Specimen>

            <Specimen label={t("alerts.titleOnly")} className="flex-col items-stretch">
              <Alert tone="info" className="w-full">
                <AlertTitle>{t("alerts.pending")}</AlertTitle>
              </Alert>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="card"
            title={t("card.title")}
            description={t("card.description")}
          >
            <Specimen label={t("card.fullComposition")} className="items-stretch">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle>{t("card.inviteTitle")}</CardTitle>
                  <CardDescription>{t("card.inviteDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor="ds-card-email">{t("card.email")}</FieldLabel>
                    <Input
                      id="ds-card-email"
                      type="email"
                      placeholder={t("card.emailPlaceholder")}
                    />
                  </Field>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button variant="ghost" size="sm">{t("card.cancel")}</Button>
                  <Button size="sm">{t("card.sendInvite")}</Button>
                </CardFooter>
              </Card>

              <Card className="w-full max-w-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>helsinki</CardTitle>
                    <Badge tone="success">{t("badges.live")}</Badge>
                  </div>
                  <CardDescription>{t("card.siteMeta")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground-muted">{t("card.siteBody")}</p>
                </CardContent>
                <CardFooter>
                  <Button variant="secondary" size="sm">{t("card.open")}</Button>
                  <Button variant="ghost" size="sm">{t("card.deploy")}</Button>
                </CardFooter>
              </Card>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            id="table"
            title={t("table.title")}
            description={t("table.description")}
          >
            <Specimen label={t("table.users")} className="block p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.email")}</TableHead>
                    <TableHead>{t("table.role")}</TableHead>
                    <TableHead>{t("table.country")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>ada@bizbee.example</TableCell>
                    <TableCell>
                      <Badge tone="primary" dot={false}>SuperAdmin</Badge>
                    </TableCell>
                    <TableCell>FI</TableCell>
                    <TableCell>
                      <Badge tone="success">{t("table.active")}</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>liis@bizbee.example</TableCell>
                    <TableCell>
                      <Badge tone="neutral" dot={false}>Admin</Badge>
                    </TableCell>
                    <TableCell>EE</TableCell>
                    <TableCell>
                      <Badge tone="success">{t("table.active")}</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>juhan@bizbee.example</TableCell>
                    <TableCell>
                      <Badge tone="neutral" dot={false}>Editor</Badge>
                    </TableCell>
                    <TableCell>EE</TableCell>
                    <TableCell>
                      <Badge tone="info">{t("table.invited")}</Badge>
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
