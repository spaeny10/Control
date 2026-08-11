import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { ComposeForm } from "./compose-form";
import { isGmailConfigured } from "@/lib/google/gmail";
import type { ChatterParent } from "@/lib/actions/message-actions";
import {
  StickyNote,
  Mail,
  MessageSquare,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";

export type ChatterMessage = {
  id: string;
  channel: "NOTE" | "EMAIL" | "SMS" | "SYSTEM";
  direction: "IN" | "OUT";
  subject: string | null;
  body: string;
  fromAddress: string | null;
  toAddress: string | null;
  deliveryStatus: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | null;
  createdAt: Date;
  author: { name: string } | null;
};

const channelIcons = {
  NOTE: StickyNote,
  EMAIL: Mail,
  SMS: MessageSquare,
  SYSTEM: Zap,
};

export function Chatter({
  messages,
  parent,
  revalidate,
  defaultEmailTo,
}: {
  messages: ChatterMessage[];
  parent: ChatterParent;
  revalidate: string;
  /** Prefills the email composer (usually the record's primary/AP contact). */
  defaultEmailTo?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ComposeForm
          parent={parent}
          revalidate={revalidate}
          emailEnabled={isGmailConfigured()}
          defaultTo={defaultEmailTo}
        />
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          )}
          {messages.map((m) => {
            const Icon = channelIcons[m.channel];
            return (
              <div key={m.id} className="flex gap-3 rounded-md border p-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {m.author?.name ??
                        (m.direction === "IN" ? m.fromAddress : "System")}
                    </span>
                    {m.channel !== "NOTE" && m.channel !== "SYSTEM" && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        {m.direction === "IN" ? (
                          <ArrowDownLeft className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        {m.channel}
                      </Badge>
                    )}
                    {m.deliveryStatus && (
                      <Badge
                        variant={
                          m.deliveryStatus === "FAILED"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {m.deliveryStatus.toLowerCase()}
                      </Badge>
                    )}
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                  {m.subject && (
                    <p className="mt-1 text-sm font-medium">{m.subject}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
