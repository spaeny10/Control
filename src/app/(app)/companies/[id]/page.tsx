import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { Chatter } from "@/components/chatter/chatter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, fullName } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";

export const metadata = { title: "Company" };

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { lastName: "asc" } },
      projects: { orderBy: { createdAt: "desc" } },
      subscriptions: { orderBy: { createdAt: "desc" } },
      leads: { orderBy: { createdAt: "desc" }, take: 10 },
      messages: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!company) notFound();

  const address = [
    company.billingStreet,
    [company.billingCity, company.billingState, company.billingZip]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          <p className="text-muted-foreground">{address || "No address"}</p>
        </div>
        <CompanyFormDialog
          company={{
            id: company.id,
            name: company.name,
            billingStreet: company.billingStreet,
            billingCity: company.billingCity,
            billingState: company.billingState,
            billingZip: company.billingZip,
            website: company.website,
            notes: company.notes,
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contacts</CardTitle>
              <ContactFormDialog companies={[]} fixedCompanyId={company.id} />
            </CardHeader>
            <CardContent>
              {company.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contacts yet.
                </p>
              ) : (
                <div className="divide-y">
                  {company.contacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{fullName(c)}</p>
                        <p className="text-xs text-muted-foreground">
                          {[c.title, c.email, c.phone]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <ContactFormDialog
                        contact={c}
                        companies={[]}
                        fixedCompanyId={company.id}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Project history ({company.projects.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {company.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No projects yet. Repeat business shows up here.
                </p>
              ) : (
                <div className="divide-y">
                  {company.projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <Link
                          href={`/projects/${p.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[p.siteCity, p.siteState].filter(Boolean).join(", ")}
                          {p.expectedStart &&
                            ` · ${formatDate(p.expectedStart)} → ${formatDate(
                              p.expectedEnd
                            )}`}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(p.status)}>
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {company.leads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {company.leads.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between py-2"
                    >
                      <Link
                        href={`/leads/${l.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                      <Badge variant={statusBadgeVariant(l.stage)}>
                        {l.stage.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Chatter
            messages={company.messages}
            parent={{ companyId: company.id }}
            revalidate={`/companies/${company.id}`}
          />
        </div>
      </div>
    </div>
  );
}
