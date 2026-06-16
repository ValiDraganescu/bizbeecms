import { useTranslations } from "next-intl";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Field,
  FieldLabel,
  FieldHint,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";

/**
 * UI foundation styleguide. This page exists to exercise the theme tokens and
 * composable base components; the real PM pages (auth, sites, …) will be built
 * with these same primitives. All copy is localized (EN/FI/ET).
 */
export default function Home() {
  const t = useTranslations("home");
  const tApp = useTranslations("app");
  const tRoles = useTranslations("roles");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {tApp("name")} · {tApp("projectManager")}
          </h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            {t("subtitle")}
          </p>
          <Link
            href="/design-system"
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("openDesignSystem")}
            <svg
              width="15"
              height="15"
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
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("buttons.title")}</CardTitle>
            <CardDescription>{t("buttons.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="primary">{t("buttons.title")}</Button>
            <Button variant="secondary">{t("fields.title")}</Button>
            <Button variant="ghost">{t("users.title")}</Button>
            <Button variant="danger">{t("buttons.cancel")}</Button>
          </CardContent>
          <CardFooter>
            <Button size="sm">{t("buttons.save")}</Button>
            <Button size="sm" variant="ghost">
              {t("buttons.cancel")}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("fields.title")}</CardTitle>
            <CardDescription>{t("fields.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
              <Input id="email" type="email" placeholder="you@example.com" />
              <FieldHint>{t("fields.emailHint")}</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="role">{t("fields.role")}</FieldLabel>
              <Select id="role" defaultValue="SiteManager">
                <option value="SuperAdmin">{tRoles("superAdmin")}</option>
                <option value="Admin">{tRoles("admin")}</option>
                <option value="SiteManager">{tRoles("siteManager")}</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.title")}</CardTitle>
          <CardDescription>{t("users.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.email")}</TableHead>
                <TableHead>{t("users.role")}</TableHead>
                <TableHead>{t("users.country")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>ada@bizbee.example</TableCell>
                <TableCell>{tRoles("superAdmin")}</TableCell>
                <TableCell>FI</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>liis@bizbee.example</TableCell>
                <TableCell>{tRoles("admin")}</TableCell>
                <TableCell>EE</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
