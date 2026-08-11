import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Chatter } from "@/components/chatter/chatter";
import { ActivitiesCard } from "@/components/activities/activities-card";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { cn } from "@/lib/utils";
import { EndSubscriptionDialog } from "@/components/subscriptions/end-subscription-dialog";
import { AdjustBillingDialog } from "@/components/subscriptions/adjust-billing-dialog";
import { DeployTrailersDialog } from "@/components/subscriptions/deploy-trailers-dialog";
import { ReturnTrailerButton } from "@/components/fleet/return-trailer-button";
import { DeploymentDocsDialog } from "@/components/fleet/deployment-docs-dialog";
import { DeploymentDocsList } from "@/components/fleet/deployment-docs-list";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate, fullName } from "@/lib/format";
import { CYCLE_SUFFIX } from "@/lib/cycles";
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
        billingContact: true,
        siteContact: true,
        // The Project holds the job site and its planned schedule. There's no
        // Projects page any more, so this is where ops sees and edits them.
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            companyId: true,
            siteStreet: true,
            siteCity: true,
            siteState: true,
            siteZip: true,
            expectedStart: true,
            expectedEnd: true,
            notes: true,
          },
        },
        quote: {
          select: { id: true, number: true, lineItems: true },
        },
        deployments: {
          orderBy: { deployedAt: "desc" },
          include: {
            trailer: { select: { id: true, unitNumber: true, model: true } },
            photos: {
              select: { id: true, phase: true, createdAt: true },
              orderBy: { createdAt: "asc" },
            },
            signatures: {
              select: {
                id: true,
                phase: true,
                signedBy: true,
                createdAt: true,
              },
              orderBy: { createdAt: "asc" },
            },
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
  const p = subscription.project;
  const siteAddress =
    [
      p?.siteStreet,
      [p?.siteCity, p?.siteState].filter(Boolean).join(", "),
      p?.siteZip,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  // Default per-unit rate for added trailers: the quote's recurring rate,
  // falling back to cycle amount split across units currently on site.
  const quoteRecurring = subscription.quote?.lineItems.filter(
    (i) => i.cycle !== "ONE_TIME"
  );
  const quoteUnits =
    quoteRecurring?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const quoteRecurringTotal =
    quoteRecurring?.reduce(
      (sum, i) => sum + i.quantity * Number(i.unitPrice),
      0
    ) ?? 0;
  const defaultUnitRate =
    quoteUnits > 0
      ? Math.round((quoteRecurringTotal / quoteUnits) * 100) / 100
      : activeDeployments.length > 0
        ? Math.round(
            (Number(subscription.cycleAmount) / activeDeployments.length) * 100
          ) / 100
        : 0;

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
            {/* Plain text: this page IS the job now, so there's nowhere
                more specific to link to. */}
            {subscription.project && <>{subscription.project.name}{" · "}</>}
            {formatCurrency(Number(subscription.cycleAmount))}
            {CYCLE_SUFFIX[subscription.billingCycle]}
            {subscription.billingCycle !== "MONTHLY" &&
              ` (≈ ${formatCurrency(Number(subscription.mrr))}/mo)`}
            {" · started "}
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
        {isLive && (
          <div className="flex items-center gap-2">
            <AdjustBillingDialog
              subscriptionId={subscription.id}
              currentCycleAmount={Number(subscription.cycleAmount)}
              cycleSuffix={CYCLE_SUFFIX[subscription.billingCycle]}
              hasStripe={!!subscription.stripeSubscriptionId}
            />
            <EndSubscriptionDialog subscriptionId={subscription.id} />
          </div>
        )}
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
                  defaultUnitRate={defaultUnitRate}
                  cycleSuffix={CYCLE_SUFFIX[subscription.billingCycle]}
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
                    <div key={d.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <Link
                            href={`/fleet/${d.trailer.id}`}
                            className="font-medium hover:underline"
                          >
                            {d.trailer.unitNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(d.deployedAt)} →{" "}
                            {d.returnedAt
                              ? formatDate(d.returnedAt)
                              : "on site"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <DeploymentDocsDialog
                            deploymentId={d.id}
                            unitNumber={d.trailer.unitNumber}
                            defaultPhase={d.returnedAt ? "RETURN" : "DELIVERY"}
                          />
                          {!d.returnedAt && isLive && (
                            <ReturnTrailerButton
                              deploymentId={d.id}
                              unitNumber={d.trailer.unitNumber}
                            />
                          )}
                        </div>
                      </div>
                      <DeploymentDocsList
                        photos={d.photos}
                        signatures={d.signatures}
                      />
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

        <div className="space-y-6">
          {subscription.project && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Site &amp; schedule</CardTitle>
                  <CardDescription>
                    The expected end date is what Dispatch schedules pickups
                    from.
                  </CardDescription>
                </div>
                <ProjectFormDialog
                  project={subscription.project}
                  companies={[]}
                  fixedCompanyId={subscription.project.companyId}
                  triggerLabel="Edit"
                  title="Site & schedule"
                />
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Site</dt>
                    <dd className="font-medium">{siteAddress ?? "—"}</dd>
                  </div>
                  {/* Who the driver calls vs who gets the invoice — separate
                      people, and invoices go to the second one. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-muted-foreground">Site contact</dt>
                      <dd className="font-medium">
                        {subscription.siteContact
                          ? fullName(subscription.siteContact)
                          : "—"}
                      </dd>
                      {subscription.siteContact?.phone && (
                        <dd className="text-xs text-muted-foreground">
                          {subscription.siteContact.phone}
                        </dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Accounts payable
                      </dt>
                      <dd
                        className={cn(
                          "font-medium",
                          !subscription.billingContact && "text-destructive"
                        )}
                      >
                        {subscription.billingContact
                          ? fullName(subscription.billingContact)
                          : "not set"}
                      </dd>
                      <dd className="truncate text-xs text-muted-foreground">
                        {subscription.billingContact?.email ??
                          "invoices have no recipient"}
                      </dd>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-muted-foreground">Expected start</dt>
                      <dd className="font-medium">
                        {formatDate(subscription.project.expectedStart)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Expected end</dt>
                      <dd
                        className={cn(
                          "font-medium",
                          !subscription.project.expectedEnd &&
                            isLive &&
                            "text-destructive"
                        )}
                      >
                        {subscription.project.expectedEnd
                          ? formatDate(subscription.project.expectedEnd)
                          : "not set"}
                      </dd>
                    </div>
                  </div>
                  {!subscription.project.expectedEnd && isLive && (
                    <p className="text-xs text-destructive">
                      Without an end date this job never appears in Dispatch&apos;s
                      pickups-to-schedule queue.
                    </p>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* A live job accrues real work — site visits, service calls,
              renewal conversations. Previously schedulable only from the
              Projects page. */}
          <ActivitiesCard
            parent={{ subscriptionId: subscription.id }}
            revalidate={`/subscriptions/${subscription.id}`}
          />

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
