import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/layout/filter-pills";
import { SearchInput } from "@/components/layout/search-input";
import { formatDateTime } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Team inbox" };

const PAGE_SIZE = 50;

function recordHref(m: {
  leadId: string | null;
  quoteId: string | null;
  subscriptionId: string | null;
  companyId: string | null;
  projectId: string | null;
  trailerId: string | null;
}) {
  if (m.leadId) return `/leads/${m.leadId}`;
  if (m.quoteId) return `/quotes/${m.quoteId}`;
  if (m.subscriptionId) return `/subscriptions/${m.subscriptionId}`;
  if (m.companyId) return `/companies/${m.companyId}`;
  if (m.projectId) return `/projects/${m.projectId}`;
  if (m.trailerId) return `/fleet/${m.trailerId}`;
  return null;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    rep?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  // Team-wide correspondence is admin-only; members see email on the records
  // they work on, which is unchanged.
  if (session?.user?.role !== "ADMIN") redirect("/");

  const { q, rep, dir, page } = await searchParams;
  const search = q?.trim();
  const direction = dir === "IN" || dir === "OUT" ? dir : undefined;
  const currentPage = Math.max(1, parseInt(page ?? "1") || 1);

  const where: Prisma.MessageWhereInput = {
    channel: "EMAIL",
    ...(direction ? { direction } : {}),
    ...(rep ? { authorId: rep } : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: "insensitive" } },
            { body: { contains: search, mode: "insensitive" } },
            { fromAddress: { contains: search, mode: "insensitive" } },
            { toAddress: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, reps] = await Promise.all([
    prisma.message.count({ where }),
    prisma.user.findMany({
      where: { messages: { some: { channel: "EMAIL" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Clamp before querying: changing a filter or the search box keeps ?page=,
  // which would otherwise land past the end of a smaller result set.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumber = Math.min(currentPage, totalPages);

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (pageNumber - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      author: { select: { name: true } },
      company: { select: { name: true } },
      lead: { select: { title: true } },
      subscription: { select: { company: { select: { name: true } } } },
    },
  });

  const keep = {
    q: search,
    rep,
    dir: direction,
  };

  function pageHref(target: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) params.set(k, v);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/inbox?${qs}` : "/inbox";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team inbox</h1>
          <p className="text-muted-foreground">
            Every customer email across the team ·{" "}
            {total.toLocaleString()} message{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search email..." />
          <FilterPills
            basePath="/inbox"
            param="dir"
            current={direction}
            keepParams={{ q: search, rep }}
            options={[
              { value: "IN", label: "Received" },
              { value: "OUT", label: "Sent" },
            ]}
          />
        </div>
      </div>

      {reps.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rep
          </span>
          <FilterPills
            basePath="/inbox"
            param="rep"
            current={rep}
            keepParams={{ q: search, dir: direction }}
            options={reps.map((r) => ({ value: r.id, label: r.name }))}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Customer</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No customer email yet. Emails appear here once Google
                    Workspace is connected and the team starts corresponding.
                  </TableCell>
                </TableRow>
              )}
              {messages.map((m) => {
                const href = recordHref(m);
                const customer =
                  m.company?.name ??
                  m.subscription?.company.name ??
                  m.lead?.title ??
                  "—";
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.direction === "IN" ? (
                        <ArrowDownLeft className="h-4 w-4 text-[#2a78d6]" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {customer}
                        </Link>
                      ) : (
                        customer
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {m.subject ?? "(no subject)"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.author?.name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                      {m.direction === "IN" ? m.fromAddress : m.toAddress}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                      {m.deliveryStatus === "FAILED" && (
                        <Badge variant="destructive" className="ml-2">
                          failed
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pageNumber} of {totalPages}
          </p>
          <div className="flex gap-2">
            {/* Rendered as a plain disabled button at the bounds — `disabled`
                has no effect on the anchor that asChild produces. */}
            {pageNumber > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(pageNumber - 1)}>Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            )}
            {pageNumber < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(pageNumber + 1)}>Next</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
