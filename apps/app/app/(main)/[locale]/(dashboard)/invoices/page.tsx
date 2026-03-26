import { InvoicesClient } from "@/components/organisms/invoices/invoices-client";
import { getInvoices } from "@workspace/modules/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoices",
};

export default async function InvoicesPage() {
  const [invoicesRes] = await Promise.all([getInvoices({ limit: 50 })]);

  const initialData = invoicesRes.success ? (invoicesRes as any).data : null;

  return <InvoicesClient initialData={initialData} />;
}
