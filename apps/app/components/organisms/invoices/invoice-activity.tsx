"use client";

import { useQuery } from "@tanstack/react-query";
import { getInvoiceActivity } from "@workspace/modules/invoice/invoice.action";
import { format } from "date-fns";
import { User, Clock, FileEdit, CheckCircle2, History } from "lucide-react";
import { ScrollArea } from "@workspace/ui";
import { useMemo } from "react";

interface InvoiceActivityProps {
  invoiceId: string;
}

export function InvoiceActivity({ invoiceId }: InvoiceActivityProps) {
  const { data: response, isLoading } = useQuery({
    queryKey: ["invoice-activity", invoiceId],
    queryFn: () => getInvoiceActivity(invoiceId),
    enabled: !!invoiceId,
  });

  const activities = useMemo(() => response?.data || [], [response]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-muted border border-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted border border-border rounded w-1/3" />
              <div className="h-3 bg-muted border border-border rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted border border-border mb-4">
          <History className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm text-muted-foreground font-medium tracking-tight italic">
          No activity recorded yet
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0 pb-4">
      {/* Timeline Line */}
      <div className="absolute left-[15px] top-6 bottom-6 w-px bg-border" />

      {activities.map((activity: any, index: number) => (
        <div key={activity.id} className="relative pl-12 pb-10 last:pb-0 group">
          {/* Dot/Icon */}
          <div className="absolute left-0 top-0 z-10">
            <div
              className={`w-[31px] h-[31px] rounded-full flex items-center justify-center border-2 border-background shadow-sm transition-all group-hover:scale-110 ${
                activity.action === "invoice.created"
                  ? "bg-emerald-500/20 text-emerald-500"
                  : activity.action === "invoice.updated"
                    ? "bg-amber-500/20 text-amber-500"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {activity.action === "invoice.created" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : activity.action === "invoice.updated" ? (
                <FileEdit className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest font-mono">
                {activity.action === "invoice.created"
                  ? "Created"
                  : activity.action === "invoice.updated"
                    ? "Updated"
                    : activity.action.replace("invoice.", "").replace("_", " ")}
              </span>
              <span className="text-[9px] text-muted-foreground/40 font-bold uppercase tracking-[0.2em] font-mono">
                {format(new Date(activity.created_at), "MMM d, HH:mm")}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 font-mono italic opacity-70">
              <span>by</span>
              <span className="font-bold text-foreground not-italic">
                {activity.user?.name || activity.user?.email || "System"}
              </span>
            </div>

            {activity.action === "invoice.updated" &&
              activity.before &&
              activity.after && (
                <ActivityDiff before={activity.before} after={activity.after} />
              )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityDiff({ before, after }: { before: any; after: any }) {
  const changes = useMemo(() => {
    const diffs: Array<{ field: string; from: any; to: any }> = [];
    const keys = ["status", "amount", "dueDate", "customerId", "isPublic"];

    for (const key of keys) {
      if (before[key] !== after[key]) {
        diffs.push({ field: key, from: before[key], to: after[key] });
      }
    }
    return diffs;
  }, [before, after]);

  if (changes.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 border-l border-border pl-3 py-1">
      {changes.map((change) => (
        <div
          key={change.field}
          className="text-[10px] flex items-center gap-2 font-mono"
        >
          <span className="text-muted-foreground/60 uppercase tracking-tighter w-16 shrink-0">
            {change.field.replace(/([A-Z])/g, " $1")}
          </span>
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="line-through text-muted-foreground/40 truncate max-w-[80px]">
              {String(change.from ?? "—")}
            </span>
            <span className="text-muted-foreground/40">→</span>
            <span className="text-foreground font-bold truncate">
              {String(change.to ?? "—")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
