import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Chatter } from "@/components/chatter/chatter";
import { SendQuoteButton } from "@/components/quotes/send-quote-button";
import { CopyLinkButton } from "@/components/quotes/copy-link-button";
import { RecordAcceptanceDialog } from "@/components/quotes/record-acceptance-dialog";
import { auth } from "@/lib/auth";
import { QuoteLineItemsTable } from "@/components/quotes/quote-line-items-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { quoteTotals } from "@/lib/quote-utils";
import { Pencil } from "lucide-react";

export const metadata = { title: "Quote" };

const ACCEPTANCE_LABEL: Record<string, string> = {
  PHONE: "by phone",
  EMAIL: "by email",
  SIGNED_DOCUMENT: "on a signed document",
  IN_PERSON: "in person",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      contact: true,
      lead: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      subscriptions: { select: { id: true } },
      // Set only when someone recorded an off-platform acceptance.
      acceptedByUser: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!quote) notFound();

  const totals = quoteTotals(quote.lineItems);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = `${baseUrl}/q/${quote.publicToken}`;
  const editable = quote.status === "DRAFT" || quote.status === "SENT";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {quote.number}
            </h1>
            <Badge variant={statusBadgeVariant(quote.status)}>
              {quote.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            <Link
              href={`/companies/${quote.company.id}`}
              className="hover:underline"
            >
              {quote.company.name}
            </Link>
            {quote.contact && ` · ${fullName(quote.contact)}`}
            {quote.validUntil &&
              ` · valid until ${formatDate(quote.validUntil)}`}
          </p>
          {quote.acceptedAt && (
            <p className="text-sm font-medium text-green-700">
              Accepted by {quote.acceptedByName} on{" "}
              {formatDateTime(quote.acceptedAt)}
              {/* Say plainly which acceptances were customer-clicked and which
                  a team member recorded on their behalf. */}
              {quote.acceptedVia && quote.acceptedVia !== "ONLINE" && (
                <span className="font-normal text-muted-foreground">
                  {" · "}
                  {ACCEPTANCE_LABEL[quote.acceptedVia]}, recorded by{" "}
                  {quote.acceptedByUser?.name ?? "a team member"}
                </span>
              )}
              {quote.acceptedVia === "ONLINE" && (
                <span className="font-normal text-muted-foreground">
                  {" · accepted online"}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyLinkButton url={publicUrl} />
          {editable && (
            <>
              <Button asChild variant="outline" className="gap-1">
                <Link href={`/quotes/${quote.id}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
              <SendQuoteButton
                quoteId={quote.id}
                resend={quote.status === "SENT"}
              />
            </>
          )}
          {/* Off-platform acceptance. EXPIRED is included because a quote
              lapsing while the customer decided is exactly the common case. */}
          {isAdmin &&
            (quote.status === "SENT" || quote.status === "EXPIRED") && (
              <RecordAcceptanceDialog
                quoteId={quote.id}
                defaultName={quote.contact ? fullName(quote.contact) : null}
                wasExpired={quote.status === "EXPIRED"}
              />
            )}
          {quote.status === "ACCEPTED" &&
            quote.subscriptions.length === 0 && (
              <Button asChild className="gap-1">
                <Link href={`/subscriptions/new?quoteId=${quote.id}`}>
                  Convert to subscription
                </Link>
              </Button>
            )}
          {quote.subscriptions.length > 0 && (
            <Button asChild variant="outline">
              <Link href={`/subscriptions/${quote.subscriptions[0].id}`}>
                View subscription
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <QuoteLineItemsTable
                lineItems={quote.lineItems}
                totals={totals}
              />
            </CardContent>
          </Card>

          {(quote.lead || quote.project || quote.terms) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {quote.lead && (
                  <p>
                    <span className="text-muted-foreground">Lead: </span>
                    <Link
                      href={`/leads/${quote.lead.id}`}
                      className="font-medium hover:underline"
                    >
                      {quote.lead.title}
                    </Link>
                  </p>
                )}
                {quote.project && (
                  <p>
                    <span className="text-muted-foreground">Project: </span>
                    <Link
                      href={`/projects/${quote.project.id}`}
                      className="font-medium hover:underline"
                    >
                      {quote.project.name}
                    </Link>
                  </p>
                )}
                {quote.terms && (
                  <div>
                    <p className="text-muted-foreground">Terms:</p>
                    <p className="whitespace-pre-wrap">{quote.terms}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Chatter
            messages={quote.messages}
            parent={{ quoteId: quote.id }}
            revalidate={`/quotes/${quote.id}`}
          />
        </div>
      </div>
    </div>
  );
}
