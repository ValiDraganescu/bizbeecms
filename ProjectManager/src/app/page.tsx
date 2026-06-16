import { ThemeToggle } from "@/components/theme/theme-toggle";
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
 * with these same primitives.
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">bizbeecms · ProjectManager</h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            Cloudflare-native multi-site B2B whitelabel CMS. UI foundation:
            Tailwind, purpose-named light/dark theme, composable components.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Variants reference purpose tokens.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </CardContent>
          <CardFooter>
            <Button size="sm">Save</Button>
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Form fields</CardTitle>
            <CardDescription>Composed, not configured.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" placeholder="you@example.com" />
              <FieldHint>Used for sign-in and invites.</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="role">Role</FieldLabel>
              <Select id="role" defaultValue="SiteManager">
                <option value="SuperAdmin">SuperAdmin</option>
                <option value="Admin">Admin</option>
                <option value="SiteManager">SiteManager</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Composable table primitives.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Country</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>ada@bizbee.example</TableCell>
                <TableCell>SuperAdmin</TableCell>
                <TableCell>FI</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>liis@bizbee.example</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell>EE</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
