import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { fullName } from "@/lib/format";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { lastName: "asc" },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            {contacts.length} contact{contacts.length === 1 ? "" : "s"}
          </p>
        </div>
        <ContactFormDialog companies={companies} />
      </div>

      <Card>
        <CardContent className="p-0">
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
                  <TableCell className="font-medium">{fullName(c)}</TableCell>
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
                    <ContactFormDialog contact={c} companies={companies} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
