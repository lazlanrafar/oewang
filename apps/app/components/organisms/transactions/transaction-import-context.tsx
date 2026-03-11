import { createContext, useContext } from "react";
import type { Control, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { z, type ZodType } from "zod";

export const mappableFields = {
  date: {
    label: "Date",
    required: true,
  },
  name: {
    label: "Description",
    required: true,
  },
  amount: {
    label: "Amount",
    required: true,
  },
  type: {
    label: "Type",
    required: false,
  },
  category: {
    label: "Category",
    required: false,
  },
  walletIdColumn: {
    label: "Account",
    required: false,
  },
} as const;

export const importSchema: ZodType<any, any, any> = z.object({
  file: z.any().optional(),
  currency: z.string().default("USD"),
  walletId: z.string().default(""),
  amount: z.string().default(""),
  date: z.string().default(""),
  name: z.string().default(""),
  type: z.string().default(""),
  category: z.string().default(""),
  walletIdColumn: z.string().default(""),
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
  valueMappings: {
    categories: Record<string, string>;
    wallets: Record<string, string>;
    types: Record<string, string>;
  };
  setValueMappings: (mappings: {
    categories: Record<string, string>;
    wallets: Record<string, string>;
    types: Record<string, string>;
  }) => void;
} | null>(null);

export function useCsvContext() {
  const context = useContext(ImportCsvContext);
  if (!context)
    throw new Error(
      "useCsvContext must be used within an ImportCsvContext.Provider",
    );
  return context;
}
