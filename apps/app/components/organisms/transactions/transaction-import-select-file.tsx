"use client";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useCallback, useEffect, useRef, useState } from "react";
import Dropzone, { type FileRejection } from "react-dropzone";
import { Controller } from "react-hook-form";
import { useCsvContext } from "./transaction-import-context";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui";

export function SelectFile() {
  const { control, setFileColumns, setFirstRows } = useCsvContext();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);

      // Detect file type
      const isExcel =
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel" ||
        file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls");

      const reader = new FileReader();

      if (isExcel) {
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              setError("Excel file has no sheets.");
              setIsLoading(false);
              return;
            }
            const worksheet = workbook.Sheets[firstSheetName];
            if (!worksheet) {
              setError("Excel worksheet is empty or invalid.");
              setIsLoading(false);
              return;
            }

            // Convert to JSON with headers
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
              defval: "",
            });

            if (jsonData.length < 1) {
              setError("Excel file looks empty.");
              setIsLoading(false);
              return;
            }

            // Extract headers from the first row of JSON
            const headers = Object.keys(jsonData[0] as object);

            setFileColumns(headers);
            setFirstRows(jsonData as Record<string, string>[]);
            setIsLoading(false);
          } catch (err: any) {
            setError("Failed to parse Excel: " + err.message);
            setIsLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reader.onload = (e) => {
          const text = e.target?.result as string;
          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<any>) => {
              if (results.data.length < 1) {
                setError("CSV file looks empty.");
                setIsLoading(false);
                return;
              }

              setFileColumns(results.meta.fields || []);
              setFirstRows(results.data as any[]);
              setIsLoading(false);
            },
            error: (err: Error) => {
              setError("Failed to parse CSV: " + err.message);
              setIsLoading(false);
            },
          });
        };
        reader.readAsText(file);
      }
    },
    [setFileColumns, setFirstRows],
  );

  return (
    <div className="flex flex-col gap-3">
      <Controller
        control={control}
        name="file"
        render={({ field: { onChange } }) => (
          <Dropzone
            onDrop={(acceptedFiles) => {
              const file = acceptedFiles[0];
              if (file) {
                onChange(file);
                processFile(file);
              }
            }}
            maxFiles={1}
            accept={{
              "text/csv": [".csv"],
              "application/vnd.ms-excel": [".csv", ".xls"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                [".xlsx"],
            }}
            maxSize={5000000}
          >
            {({ getRootProps, getInputProps, isDragActive }) => (
              <div
                {...getRootProps()}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 p-10 border border-dashed cursor-pointer transition-colors min-h-[240px]",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
                )}
              >
                <input {...getInputProps()} />
                {isLoading ? (
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                ) : (
                  <FileUp className="w-10 h-10 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="font-medium text-sm">
                    {isLoading
                      ? "Processing file..."
                      : "Drop your CSV or Excel here, or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max 5MB. CSV or Excel format (.xlsx, .xls).
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-destructive font-medium">
                    {error}
                  </p>
                )}
              </div>
            )}
          </Dropzone>
        )}
      />
    </div>
  );
}
