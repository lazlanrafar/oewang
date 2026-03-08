"use client";

import Papa from "papaparse";
import { useCallback, useEffect, useRef, useState } from "react";
import Dropzone, { type FileRejection } from "react-dropzone";
import { Controller } from "react-hook-form";
import { useCsvContext } from "./import-context";
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

      // Read first few lines to parse header and sample rows
      const reader = new FileReader();
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
              "application/vnd.ms-excel": [".csv"],
            }}
            maxSize={5000000}
          >
            {({ getRootProps, getInputProps, isDragActive }) => (
              <div
                {...getRootProps()}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors min-h-[240px]",
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
                      : "Drop your CSV here, or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max 5MB. CSV format only.
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
