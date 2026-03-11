import { InvoicesClient } from "@/components/organisms/invoices/invoices-client";
import { getInvoices } from "@workspace/modules/server";

export default async function InvoicesPage() {
  const [invoicesRes] = await Promise.all([getInvoices({ limit: 50 })]);

  const initialData = invoicesRes.success ? (invoicesRes as any).data : null;

  return <InvoicesClient initialData={initialData} />;
}
