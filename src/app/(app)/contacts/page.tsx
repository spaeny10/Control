import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showCompanies = view === "companies";

  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { lastName: "asc" },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      include: {
        parentCompany: { select: { name: true } },
        _count: {
          select: {
            contacts: true,
            projects: true,
            subscriptions: true,
            branches: true,
          },
        },
      },
    }),
  ]);

  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));
  const parentOptions = companies
    .filter((c) => !c.parentCompanyId)
    .map((c) => ({ id: c.id, name: c.name }));

  const toggle = [
    { key: "people", label: `People (${contacts.length})`, href: "/contacts" },
    {
      key: "companies",
      label: `Companies (${companies.length})`,
      href: "/contacts?view=companies",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            Everyone you do business with — people and companies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-card p-1">
            {toggle.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  (t.key === "companies") === showCompanies
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {showCompanies ? (
            <CompanyFormDialog parentOptions={parentOptions} />
          ) : (
            <ContactFormDialog companies={companyOptions} />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {showCompanies ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Contacts</TableHead>
                  <TableHead className="text-center">Projects</TableHead>
                  <TableHead className="text-center">Subscriptions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No companies yet.
                    </TableCell>
                  </TableRow>
                )}
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.parentCompany && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          branch of {c.parentCompany.name}
                        </span>
                      )}
                      {c._count.branches > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c._count.branches} branch
                          {c._count.branches === 1 ? "" : "es"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[c.billingCity, c.billingState]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {c._count.contacts}
                    </TableCell>
                    <TableCell className="text-center">
                      {c._count.projects}
                    </TableCell>
                    <TableCell className="text-center">
                      {c._count.subscriptions}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No contacts yet.
                    </TableCell>
                  </TableRow>
                )}
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {fullName(c)}
                      {c.isBillingContact && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px]"
                        >
                          AP / billing
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.title ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/companies/${c.company.id}`}
                        className="hover:underline"
                      >
                        {c.company.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ContactFormDialog
                        contact={c}
                        companies={companyOptions}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
