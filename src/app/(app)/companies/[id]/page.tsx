import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { PortalLinkButton } from "@/components/companies/portal-link-button";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { Chatter } from "@/components/chatter/chatter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate, fullName } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { auth } from "@/lib/auth";
import { CompanyPricesCard } from "@/components/companies/company-prices-card";

export const metadata = { title: "Company" };

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [company, session, products, parentOptions] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { lastName: "asc" } },
        projects: { orderBy: { createdAt: "desc" } },
        subscriptions: { orderBy: { createdAt: "desc" } },
        leads: { orderBy: { createdAt: "desc" }, take: 10 },
        parentCompany: { select: { id: true, name: true } },
        branches: {
          orderBy: { name: "asc" },
          include: {
            subscriptions: {
              where: { status: { not: "ENDED" } },
              select: { mrr: true },
            },
            _count: { select: { projects: true, contacts: true } },
          },
        },
        priceOverrides: true,
        messages: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } } },
        },
      },
    }),
    auth(),
    prisma.planProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { prices: { orderBy: { cycle: "asc" } } },
    }),
    prisma.company.findMany({
      where: { parentCompanyId: null, branches: { none: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!company) notFound();

  const isAdmin = session?.user?.role === "ADMIN";
  const isParent = company.branches.length > 0;

  // Roll-up across this company and its branches (metrics shared; quotes,
  // contacts, and pricing stay per-branch).
  const ownActiveMrr = company.subscriptions
    .filter((s) => s.status !== "ENDED")
    .reduce((sum, s) => sum + Number(s.mrr), 0);
  const branchActiveMrr = company.branches.reduce(
    (sum, b) => sum + b.subscriptions.reduce((s2, s) => s2 + Number(s.mrr), 0),
    0
  );
  const rollup = {
    mrr: ownActiveMrr + branchActiveMrr,
    projects:
      company.projects.length +
      company.branches.reduce((sum, b) => sum + b._count.projects, 0),
  };

  // One row per product x offered cycle.
  const priceRows = products.flatMap((p) =>
    p.prices.map((price) => {
      const override = company.priceOverrides.find(
        (o) => o.planProductId === p.id && o.cycle === price.cycle
      );
      return {
        planProductId: p.id,
        name: p.name,
        cycle: price.cycle,
        defaultPrice: Number(price.unitPrice),
        overridePrice: override ? Number(override.unitPrice) : null,
      };
    })
  );

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {company.name}
            </h1>
            {company.parentCompany && (
              <Badge variant="outline">
                Branch of{" "}
                <Link
                  href={`/companies/${company.parentCompany.id}`}
                  className="ml-1 hover:underline"
                >
                  {company.parentCompany.name}
                </Link>
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{address || "No address"}</p>
          {isParent && (
            <p className="text-sm text-muted-foreground">
              Across all branches: {formatCurrency(rollup.mrr)}/mo active MRR ·{" "}
              {rollup.projects} project{rollup.projects === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
        <PortalLinkButton companyId={company.id} />
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
            parentCompanyId: company.parentCompanyId,
          }}
          parentOptions={parentOptions}
        />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isParent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Branches ({company.branches.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {company.branches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <Link
                          href={`/companies/${b.id}`}
                          className="font-medium hover:underline"
                        >
                          {b.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[b.billingCity, b.billingState]
                            .filter(Boolean)
                            .join(", ") || "—"}{" "}
                          · {b._count.projects} project
                          {b._count.projects === 1 ? "" : "s"} ·{" "}
                          {b._count.contacts} contact
                          {b._count.contacts === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {formatCurrency(
                          b.subscriptions.reduce(
                            (s, x) => s + Number(x.mrr),
                            0
                          )
                        )}
                        /mo
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {fullName(c)}
                          {c.isBillingContact && (
                            <Badge variant="outline" className="text-[10px]">
                              AP / billing
                            </Badge>
                          )}
                        </p>
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

        <div className="space-y-6">
          {isAdmin && (
            <CompanyPricesCard companyId={company.id} rows={priceRows} />
          )}
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
