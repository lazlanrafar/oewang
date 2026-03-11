import { getCustomers } from "@workspace/modules/server";
import { CustomersClient } from "@/components/organisms/customers/customers-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customers",
};

export default async function CustomersPage() {
  const result = await getCustomers({ limit: 50 });
  const customers = result.success ? (result.data ?? []) : [];

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <CustomersClient initialData={customers} />
      </div>
    </div>
  );
}
