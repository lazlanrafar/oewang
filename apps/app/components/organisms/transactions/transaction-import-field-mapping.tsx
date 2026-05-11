"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui";
import { ArrowRight } from "lucide-react";
import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";

import { type ImportCsvFormData, mappableFields, useCsvContext } from "./transaction-import-context";

type MappableFieldKey = keyof typeof mappableFields;

export function FieldMapping() {
  const { fileColumns, firstRows, control } = useCsvContext();

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 font-sans">
        <div className="flex items-center justify-between px-1">
          <div className="w-[45%] font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
            CSV Column
          </div>
          <div className="w-10" />
          <div className="w-[45%] font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
            Oewang Field
          </div>
        </div>

        {(Object.entries(mappableFields) as Array<[MappableFieldKey, (typeof mappableFields)[MappableFieldKey]]>).map(
          ([key, field]) => (
          <FieldRow
            key={key}
            fieldKey={key}
            label={field.label}
            required={field.required}
            columns={fileColumns || []}
            control={control}
            firstRows={firstRows || []}
          />
          ),
        )}
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
  fieldKey: MappableFieldKey;
  label: string;
  required: boolean;
  columns: string[];
  control: Control<ImportCsvFormData>;
  firstRows: Record<string, string>[];
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
                <SelectTrigger className="h-10 text-foreground/80 text-xs">
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
                <div className="overflow-hidden px-2">
                  <p className="truncate text-[10px] text-muted-foreground italic">
                    Preview:{" "}
                    {firstRows
                      ? firstRows
                          .map((row) => (typeof field.value === "string" ? row[field.value] : ""))
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

      <div className="flex w-10 shrink-0 items-center justify-center">
        <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
      </div>

      <div className="flex h-10 w-[45%] min-w-0 items-center justify-between border bg-muted/30 px-3">
        <span className="font-medium text-foreground/80 text-xs">{label}</span>
        {required && <span className="ml-1 font-bold text-[10px] text-red-500">*</span>}
      </div>
    </div>
  );
}
