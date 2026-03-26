"use client";

import { useCsvContext, mappableFields } from "./transaction-import-context";
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
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 font-sans">
        <div className="flex items-center justify-between px-1">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-[45%]">
            CSV Column
          </div>
          <div className="w-10" />
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-[45%]">
            Oewang Field
          </div>
        </div>

        {Object.entries(mappableFields).map(([key, field]) => (
          <FieldRow
            key={key}
            fieldKey={key}
            label={field.label}
            required={field.required}
            columns={fileColumns || []}
            control={control}
            firstRows={firstRows || []}
          />
        ))}
      </div>

      {/* <div className="pt-4 border-t border-border">
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
      </div> */}
    </div>
  );
}

function FieldRow({
  fieldKey,
  label,
  required,
  columns,
  control,
  firstRows,
}: {
  fieldKey: string;
  label: string;
  required: boolean;
  columns: string[];
  control: any;
  firstRows: any[];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="w-[45%] min-w-0 space-y-1">
        <Controller
          control={control}
          name={fieldKey}
          render={({ field }) => (
            <div className="space-y-1.5">
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-10 text-xs text-foreground/80">
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
              {field.value && (
                <div className="px-2 overflow-hidden">
                  <p className="text-[10px] text-muted-foreground truncate italic">
                    Preview:{" "}
                    {firstRows
                      ? firstRows
                          .map((row: any) => row[field.value])
                          .filter(Boolean)
                          .slice(0, 3)
                          .join(", ")
                      : "..."}
                  </p>
                </div>
              )}
            </div>
          )}
        />
      </div>

      <div className="flex items-center justify-center w-10 shrink-0">
        <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
      </div>

      <div className="flex items-center justify-between px-3 h-10 bg-muted/30 border w-[45%] min-w-0">
        <span className="text-xs font-medium text-foreground/80">{label}</span>
        {required && (
          <span className="text-[10px] text-red-500 font-bold ml-1">*</span>
        )}
      </div>
    </div>
  );
}
