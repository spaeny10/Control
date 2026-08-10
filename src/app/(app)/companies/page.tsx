import Link from "next/link";
import { prisma } from "@/lib/prisma";
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

export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { contacts: true, projects: true, subscriptions: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">
            {companies.length} compan{companies.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <CompanyFormDialog />
      </div>

      <Card>
        <CardContent className="p-0">
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
                    No companies yet. Create your first one.
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
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[c.billingCity, c.billingState].filter(Boolean).join(", ") ||
                      "—"}
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
        </CardContent>
      </Card>
    </div>
  );
}
