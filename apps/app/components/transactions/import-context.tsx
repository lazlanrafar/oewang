import { createContext, useContext } from "react";
import type { Control, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { z } from "zod";

export const mappableFields = {
  date: {
    label: "Date",
    required: true,
  },
  description: {
    label: "Description",
    required: true,
  },
  amount: {
    label: "Amount",
    required: true,
  },
} as const;

export const importSchema = z.object({
  file: z.instanceof(File).optional(),
  currency: z.string().min(1, "Currency is required"),
  walletId: z.string().min(1, "Account is required"),
  amount: z.string().min(1, "Amount column is required"),
  date: z.string().min(1, "Date column is required"),
  description: z.string().min(1, "Description column is required"),
  inverted: z.boolean().default(false),
});

export type ImportCsvFormData = z.infer<typeof importSchema>;

export const ImportCsvContext = createContext<{
  fileColumns: string[] | null;
  setFileColumns: (columns: string[] | null) => void;
  firstRows: Record<string, string>[] | null;
  setFirstRows: (rows: Record<string, string>[] | null) => void;
  control: Control<ImportCsvFormData>;
  watch: UseFormWatch<ImportCsvFormData>;
  setValue: UseFormSetValue<ImportCsvFormData>;
} | null>(null);

export function useCsvContext() {
  const context = useContext(ImportCsvContext);
  if (!context)
    throw new Error(
      "useCsvContext must be used within an ImportCsvContext.Provider",
    );
  return context;
}
