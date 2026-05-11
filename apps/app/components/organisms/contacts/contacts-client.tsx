"use client";

import { useCallback, useState } from "react";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getContacts } from "@workspace/modules/client";
import type { Contact, TransactionSettings } from "@workspace/types";
import { Button, DataTable, DataTableColumnsVisibility, DataTableEmptyState, DataTableFilter } from "@workspace/ui";
import { Plus } from "lucide-react";

import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useContactsStore } from "@/stores/contacts";

import { getContactColumns } from "./contact-columns";
import { ContactDetailSheet } from "./contact-detail-sheet";
import { ContactFormSheet } from "./contact-form-sheet";

interface Props {
  initialData: Contact[];
  dictionary: Dictionary;
  settings: TransactionSettings;
}

export function ContactsClient({ initialData, dictionary, settings }: Props) {
  const _queryClient = useQueryClient();

  const { columns, setColumns } = useContactsStore();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: { q: "" },
    pageSize: 50,
    initialPage: 0,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
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
      return pagination.page < pagination.total_pages ? pagination.page + 1 : undefined;
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

  const allContacts = data.pages?.flatMap((p) => p.data ?? []) ?? [];
  const topContact = allContacts[0];

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const addedThisMonth = allContacts.filter((c) => c.createdAt && c.createdAt >= thisMonthStart).length;

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
    <div className="flex h-full w-full flex-col space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-1 border border-border bg-muted/5 p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.total}
          </span>
          <span className="font-medium font-serif text-3xl tracking-tight">{allContacts.length}</span>
        </div>

        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.added_this_month}
          </span>
          <span className="font-medium font-serif text-3xl text-emerald-600 tracking-tight dark:text-emerald-400">
            {addedThisMonth}
          </span>
        </div>

        <div className="flex flex-col gap-1 border border-border bg-muted/5 p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.most_active}
          </span>
          <span className="truncate font-medium font-serif text-lg tracking-tight">{topContact?.name ?? "–"}</span>
          <span className="text-[10px] text-muted-foreground">{dictionary.contacts.summary.no_activity}</span>
        </div>

        <div className="flex flex-col gap-1 border border-border bg-muted/5 p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.contacts.summary.top_revenue}
          </span>
          <span className="truncate font-medium font-serif text-lg tracking-tight">{topContact?.name ?? "–"}</span>
          <span className="text-[10px] text-muted-foreground">{dictionary.contacts.summary.no_revenue}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-1">
        <div className="flex max-w-sm flex-1 items-center">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as (filters: Record<string, unknown>) => void}
            placeholder={dictionary.contacts.search_placeholder}
            showDateFilter={false}
            showAmountFilter={false}
            className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
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
            <Plus className="mr-2 h-4 w-4" />
            {dictionary.contacts.add_button}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="relative min-h-0 flex-1">
        <DataTable
          data={allContacts}
          columns={tableColumns}
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
        settings={settings}
      />
    </div>
  );
}
