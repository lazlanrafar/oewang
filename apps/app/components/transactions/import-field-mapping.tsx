"use client";

import { useCsvContext, mappableFields } from "./import-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Label,
  Switch,
  cn,
} from "@workspace/ui";
import { ArrowRight, Info } from "lucide-react";
import { Controller } from "react-hook-form";

export function FieldMapping() {
  const { fileColumns, firstRows, control } = useCsvContext();

  return (
    <div className="mt-4 space-y-6">
      <div className="grid grid-cols-[1fr,auto,1fr] gap-x-4 gap-y-3 font-sans">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          CSV Column
        </div>
        <div />
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Midday Field
        </div>

        {Object.entries(mappableFields).map(([key, field]) => (
          <FieldRow
            key={key}
            fieldKey={key}
            label={field.label}
            required={field.required}
            columns={fileColumns || []}
            control={control}
          />
        ))}
      </div>

      <div className="pt-4 border-t border-border">
        <Controller
          control={control}
          name="inverted"
          render={({ field: { value, onChange } }) => (
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Invert amounts</Label>
                <p className="text-xs text-muted-foreground">
                  Flip positive/negative values (useful for some bank exports)
                </p>
              </div>
              <Switch checked={value} onCheckedChange={onChange} />
            </div>
          )}
        />
      </div>
    </div>
  );
}

function FieldRow({
  fieldKey,
  label,
  required,
  columns,
  control,
}: {
  fieldKey: string;
  label: string;
  required: boolean;
  columns: string[];
  control: any;
}) {
  return (
    <>
      <div className="min-w-0">
        <Controller
          control={control}
          name={fieldKey}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={`Select column`} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col} className="text-xs">
                      {col}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex items-center justify-center">
        <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
      </div>

      <div className="flex items-center justify-between px-3 h-9 bg-muted/50 border border-border rounded-md">
        <span className="text-xs font-medium">{label}</span>
        {required && (
          <span className="text-[10px] text-red-500 font-bold ml-1">*</span>
        )}
      </div>
    </>
  );
}
