import { getAdminOrders } from "@workspace/modules";
import OrdersDataTableWrapper from "@/components/orders/orders-data-table-wrapper";
import OrdersSearchFilter from "@/components/orders/orders-search-filter";
import OrdersDataTableColumnVisibility from "@/components/orders/orders-data-table-column-visibility";
import { OrdersDetailSheet } from "@/components/orders/orders-detail-sheet";

export default async function OrdersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = searchParams?.page ? parseInt(searchParams.page as string) : 1;
  const limit = searchParams?.limit
    ? parseInt(searchParams.limit as string)
    : 10;
  // Make sure we pass the search param to getAdminOrders if needed in backend,
  // but for UI layout let's mount the filter here:
  const search = (searchParams?.search as string) || "";

  const response = await getAdminOrders({ page, limit, search } as any);
  const orders = response?.data?.orders ?? [];
  const meta = response?.data?.meta ?? {
    total: 0,
    total_pages: 1,
    page: 1,
    limit: 10,
  };

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage the system incoming active and historical orders.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <OrdersSearchFilter />
          <OrdersDataTableColumnVisibility />
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <OrdersDataTableWrapper
          initialData={orders}
          rowCount={meta.total}
          pageCount={meta.total_pages}
          initialPage={meta.page - 1}
          pageSize={meta.limit}
        />
      </div>

      <OrdersDetailSheet />
    </div>
  );
}
