"use client";

import type { Dispatch, SetStateAction } from "react";

import { Button, Checkbox } from "@workspace/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { ImportSuggestion } from "./transaction-import-context";

type SetSuggestions = Dispatch<SetStateAction<ImportSuggestion[]>>;

interface ApprovalProps {
  suggestions: ImportSuggestion[];
  onChange: SetSuggestions;
  degraded: boolean;
}

const SECTION_META = {
  duplicate: { title: "Possible Duplicates", tone: "amber" as const },
  category: { title: "Category Suggestions", tone: "primary" as const },
  type_sign: { title: "Type & Amount Suggestions", tone: "primary" as const },
  anomaly: { title: "Unusual Amounts", tone: "amber" as const },
};

function Section({
  type,
  items,
  onChange,
}: {
  type: ImportSuggestion["type"];
  items: ImportSuggestion[];
  onChange: SetSuggestions;
}) {
  if (items.length === 0) return null;
  const meta = SECTION_META[type];
  const toneClasses = meta.tone === "amber" ? "border-amber-500/20 bg-amber-500/5" : "border-border bg-muted/30";

  const setAll = (accepted: boolean) => {
    const ids = new Set(items.map((i) => i.id));
    onChange((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, accepted } : s)));
  };

  return (
    <div className={`border p-3 text-left font-sans ${toneClasses}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          {meta.title} ({items.length})
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider hover:text-foreground"
            onClick={() => setAll(true)}
          >
            Accept all
          </button>
          <button
            type="button"
            className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider hover:text-foreground"
            onClick={() => setAll(false)}
          >
            Reject all
          </button>
        </div>
      </div>
      <ul className="max-h-[150px] space-y-2 overflow-y-auto pr-2 text-xs">
        {items.map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            <Checkbox
              checked={s.accepted}
              onCheckedChange={(checked) =>
                onChange((prev) => prev.map((x) => (x.id === s.id ? { ...x, accepted: checked === true } : x)))
              }
              className="mt-0.5"
            />
            <div>
              <span className="font-medium text-foreground/80">Row {s.rowIndex + 1}: </span>
              <span className="text-muted-foreground">
                {s.type === "duplicate" ? `${s.reason} — checking this box skips the row.` : s.reason}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Approval({ suggestions, onChange, degraded }: ApprovalProps) {
  const acceptedCount = suggestions.filter((s) => s.accepted).length;
  const grouped = {
    duplicate: suggestions.filter((s) => s.type === "duplicate"),
    category: suggestions.filter((s) => s.type === "category"),
    type_sign: suggestions.filter((s) => s.type === "type_sign"),
    anomaly: suggestions.filter((s) => s.type === "anomaly"),
  };

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center font-sans">
        {degraded && (
          <p className="max-w-[320px] border border-amber-500/20 bg-amber-500/5 p-3 text-amber-700 text-xs">
            AI review was unavailable this time. You can still import your transactions manually.
          </p>
        )}
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="font-semibold text-sm">No issues found — you're ready to import.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      {degraded && (
        <p className="border border-amber-500/20 bg-amber-500/5 p-3 text-amber-700 text-xs">
          <AlertCircle className="mr-1 inline h-3 w-3" />
          Some AI checks were unavailable — showing what could be reviewed.
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {acceptedCount} of {suggestions.length} suggestions accepted
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onChange((s) => s.map((x) => ({ ...x, accepted: true })))}>
            Accept all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange((s) => s.map((x) => ({ ...x, accepted: false })))}
          >
            Reject all
          </Button>
        </div>
      </div>

      <Section type="duplicate" items={grouped.duplicate} onChange={onChange} />
      <Section type="category" items={grouped.category} onChange={onChange} />
      <Section type="type_sign" items={grouped.type_sign} onChange={onChange} />
      <Section type="anomaly" items={grouped.anomaly} onChange={onChange} />
    </div>
  );
}
