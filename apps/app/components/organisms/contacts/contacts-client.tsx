"use client";

import { useState, useCallback } from "react";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
  DataTableEmptyState,
} from "@workspace/ui";
import { ContactFormSheet } from "./contact-form-sheet";
import { ContactDetailSheet } from "./contact-detail-sheet";
import { getContactColumns } from "./contact-columns";
import type { Contact } from "@workspace/types";
import { Plus } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getContacts } from "@workspace/modules/client";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useContactsStore } from "@/stores/contacts";
import { useAppStore } from "@/stores/app";

interface Props {
  initialData: Contact[];
}

export function ContactsClient({ initialData }: Props) {
  const queryClient = useQueryClient();
  const { dictionary } = useAppStore();

  if (!dictionary) return null;

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(
    null,
  );
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const { columns, setColumns } = useContactsStore();

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: { q: "" },
    pageSize: 50,
    initialPage: 0,
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["contacts", filters.q],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getContacts({
        search: filters.q as string,
        page: pageParam,
        limit: 50,
      });
      if (!res.success) throw new Error(res.message);
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.meta?.pagination;
      if (!pagination) return undefined;
      return pagination.page < pagination.total_pages
        ? pagination.page + 1
        : undefined;
    },
    initialData: {
      pages: [
        {
          success: true,
          data: initialData,
          code: "OK",
          message: "Initial data",
          meta: {
            pagination: {
              total: initialData.length,
              page: 1,
              limit: 50,
              total_pages: 1,
            },
            timestamp: Date.now(),
          },
        },
      ],
      pageParams: [1],
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  if (!dictionary) return null;

  const allContacts = data?.pages.flatMap((p: any) => p.data ?? []) ?? [];

  const now = new Date();
  const thisMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const addedThisMonth = allContacts.filter(
    (c) => c.createdAt && c.createdAt >= thisMonthStart,
  ).length;

  const handleEdit = useCallback((contact: Contact) => {
    setEditContact(contact);
    setIsFormSheetOpen(true);
  }, []);

  const handleRowClick = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailSheetOpen(true);
  }, []);

  const tableColumns = getContactColumns(handleEdit, dictionary);

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.total}
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight">
            {allContacts.length}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.added_this_month}
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight text-emerald-600 dark:text-emerald-400">
            {addedThisMonth}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.most_active}
          </span>
          <span className="text-lg font-serif font-medium tracking-tight truncate">
            {allContacts.length > 0 ? (allContacts[0]?.name ?? "–") : "–"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {dictionary.contacts.summary.no_activity}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.top_revenue}
          </span>
          <span className="text-lg font-serif font-medium tracking-tight truncate">
            {allContacts.length > 0 ? (allContacts[0]?.name ?? "–") : "–"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {dictionary.contacts.summary.no_revenue}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 shrink-0 px-1">
        <div className="flex items-center flex-1 max-w-sm">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder={dictionary.contacts.search_placeholder}
            showDateFilter={false}
            showAmountFilter={false}
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <DataTableColumnsVisibility columns={columns} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditContact(null);
              setIsFormSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {dictionary.contacts.add_button}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 relative">
        <DataTable
          data={allContacts}
          columns={tableColumns as any}
          setColumns={setColumns}
          tableId="contacts"
          hFull
          emptyMessage={
            <DataTableEmptyState
              title={dictionary.contacts.empty.title}
              description={dictionary.contacts.empty.description}
              action={{
                label: dictionary.contacts.empty.action,
                onClick: () => {
                  setEditContact(null);
                  setIsFormSheetOpen(true);
                },
              }}
            />
          }
          infiniteScroll={true}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          meta={{
            onRowClick: handleRowClick,
          }}
        />
      </div>

      <ContactFormSheet
        open={isFormSheetOpen}
        onClose={() => {
          setIsFormSheetOpen(false);
          setEditContact(null);
        }}
        contact={editContact}
        dictionary={dictionary}
      />

      <ContactDetailSheet
        contact={selectedContact}
        open={isDetailSheetOpen}
        onClose={() => {
          setIsDetailSheetOpen(false);
          setSelectedContact(null);
        }}
        dictionary={dictionary}
      />
    </div>
  );
}
