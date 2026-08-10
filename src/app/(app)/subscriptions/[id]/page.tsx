import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Chatter } from "@/components/chatter/chatter";
import { EndSubscriptionDialog } from "@/components/subscriptions/end-subscription-dialog";
import { DeployTrailersDialog } from "@/components/subscriptions/deploy-trailers-dialog";
import { ReturnTrailerButton } from "@/components/fleet/return-trailer-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Subscription" };

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [subscription, availableTrailers] = await Promise.all([
    prisma.subscription.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, status: true } },
        quote: { select: { id: true, number: true } },
        deployments: {
          orderBy: { deployedAt: "desc" },
          include: {
            trailer: { select: { id: true, unitNumber: true, model: true } },
          },
        },
        invoices: { orderBy: { createdAt: "desc" } },
        messages: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } } },
        },
      },
    }),
    prisma.trailer.findMany({
      where: { status: "AVAILABLE" },
      orderBy: { unitNumber: "asc" },
      select: { id: true, unitNumber: true, model: true },
    }),
  ]);
  if (!subscription) notFound();

  const activeDeployments = subscription.deployments.filter(
    (d) => !d.returnedAt
  );
  const isLive = subscription.status !== "ENDED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {subscription.company.name}
            </h1>
            <Badge variant={statusBadgeVariant(subscription.status)}>
              {subscription.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {subscription.project && (
              <>
                <Link
                  href={`/projects/${subscription.project.id}`}
                  className="hover:underline"
                >
                  {subscription.project.name}
                </Link>
                {" · "}
              </>
            )}
            {formatCurrency(Number(subscription.mrr))}/mo · started{" "}
            {formatDate(subscription.startDate)}
            {subscription.quote && (
              <>
                {" · from "}
                <Link
                  href={`/quotes/${subscription.quote.id}`}
                  className="hover:underline"
                >
                  {subscription.quote.number}
                </Link>
              </>
            )}
          </p>
          {subscription.status === "ENDED" && (
            <p className="text-sm text-muted-foreground">
              Ended {formatDate(subscription.endedAt)} —{" "}
              {subscription.endReason?.replace(/_/g, " ").toLowerCase()}
              {subscription.endNotes && ` (${subscription.endNotes})`}
            </p>
          )}
        </div>
        {isLive && <EndSubscriptionDialog subscriptionId={subscription.id} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Trailers on site ({activeDeployments.length})
              </CardTitle>
              {isLive && (
                <DeployTrailersDialog
                  subscriptionId={subscription.id}
                  availableTrailers={availableTrailers}
                />
              )}
            </CardHeader>
            <CardContent>
              {subscription.deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No trailers deployed yet.
                </p>
              ) : (
                <div className="divide-y">
                  {subscription.deployments.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <Link
                          href={`/fleet/${d.trailer.id}`}
                          className="font-medium hover:underline"
                        >
                          {d.trailer.unitNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(d.deployedAt)} →{" "}
                          {d.returnedAt ? formatDate(d.returnedAt) : "on site"}
                        </p>
                      </div>
                      {!d.returnedAt && isLive && (
                        <ReturnTrailerButton
                          deploymentId={d.id}
                          unitNumber={d.trailer.unitNumber}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {subscription.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invoices synced yet.
                  {!subscription.stripeSubscriptionId &&
                    " This subscription isn't connected to Stripe."}
                </p>
              ) : (
                <div className="divide-y">
                  {subscription.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {inv.number ?? inv.stripeInvoiceId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(Number(inv.amountDue))} · due{" "}
                          {formatDate(inv.dueDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusBadgeVariant(inv.status)}>
                          {inv.status}
                        </Badge>
                        {inv.hostedInvoiceUrl && (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Chatter
            messages={subscription.messages}
            parent={{ subscriptionId: subscription.id }}
            revalidate={`/subscriptions/${subscription.id}`}
          />
        </div>
      </div>
    </div>
  );
}
