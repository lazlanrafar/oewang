"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getInvoiceActivity } from "@workspace/modules/invoice/invoice.action";
import type { InvoiceActivityItem } from "@workspace/types";
import { format } from "date-fns";
import { CheckCircle2, Clock, FileEdit, History } from "lucide-react";

interface InvoiceActivityProps {
  invoiceId: string;
  dictionary: Dictionary;
}

export function InvoiceActivity({ invoiceId, dictionary }: InvoiceActivityProps) {
  const dict = dictionary.invoices;
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
          <div key={i} className="flex animate-pulse gap-4">
            <div className="h-8 w-8 rounded-full border border-border bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded border border-border bg-muted" />
              <div className="h-3 w-1/2 rounded border border-border bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
          <History className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="font-medium text-muted-foreground text-sm italic tracking-tight">{dict.details.no_activity}</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0 pb-4">
      {/* Timeline Line */}
      <div className="absolute top-6 bottom-6 left-[15px] w-px bg-border" />

      {activities.map((activity: InvoiceActivityItem) => (
        <div key={activity.id} className="group relative pb-10 pl-12 last:pb-0">
          {/* Dot/Icon */}
          <div className="absolute top-0 left-0 z-10">
            <div
              className={`flex h-[31px] w-[31px] items-center justify-center rounded-full border-2 border-background shadow-sm transition-all group-hover:scale-110 ${
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
              <span className="font-bold font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
                {activity.action === "invoice.created"
                  ? dict.activities.created
                  : activity.action === "invoice.updated"
                    ? dict.activities.updated
                    : activity.action.replace("invoice.", "").replace("_", " ")}
              </span>
              <span className="font-bold font-mono text-[9px] text-muted-foreground/40 uppercase tracking-[0.2em]">
                {format(new Date(activity.created_at), "MMM d, HH:mm")}
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60 italic opacity-70">
              <span>{dictionary.common.by}</span>
              <span className="font-bold text-foreground not-italic">
                {activity.user.name || activity.user.email || dictionary.common.system}
              </span>
            </div>

            {activity.action === "invoice.updated" && activity.before && activity.after && (
              <ActivityDiff before={activity.before} after={activity.after} dict={dict} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityDiff({
  before,
  after,
  dict,
}: {
  before: Record<string, string | number | boolean | null>;
  after: Record<string, string | number | boolean | null>;
  dict: Dictionary["invoices"];
}) {
  const columnsLabels = dict.columns as Record<string, string>;
  const detailsLabels = dict.details as Record<string, string>;

  const changes = useMemo(() => {
    const diffs: Array<{
      field: string;
      from: string | number | boolean | null | undefined;
      to: string | number | boolean | null | undefined;
    }> = [];
    const keys = ["status", "amount", "dueDate", "contactId", "isPublic"];

    for (const key of keys) {
      if (before[key] !== after[key]) {
        diffs.push({ field: key, from: before[key], to: after[key] });
      }
    }
    return diffs;
  }, [before, after]);

  if (changes.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 border-border border-l py-1 pl-3">
      {changes.map((change) => (
        <div key={change.field} className="flex items-center gap-2 font-mono text-[10px]">
          <span className="w-20 shrink-0 text-muted-foreground/60 uppercase tracking-tighter">
            {columnsLabels[change.field.replace(/([A-Z])/g, "_$1").toLowerCase()] ||
              detailsLabels[change.field.replace(/([A-Z])/g, "_$1").toLowerCase()] ||
              change.field.replace(/([A-Z])/g, " $1")}
          </span>
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="max-w-[80px] truncate text-muted-foreground/40 line-through">
              {String(change.from ?? "—")}
            </span>
            <span className="text-muted-foreground/40">→</span>
            <span className="truncate font-bold text-foreground">{String(change.to ?? "—")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
