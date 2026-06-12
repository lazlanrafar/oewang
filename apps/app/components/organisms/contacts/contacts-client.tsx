"use client";

import { useCallback, useMemo, useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getContacts } from "@workspace/modules/client";
import type { Contact } from "@workspace/types";
import { DataTable, DataTableEmptyState, TableSkeleton } from "@workspace/ui";

import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { canEditWorkspaceData } from "@/lib/workspace-permissions";
import { useAppStore } from "@/stores/app";
import { useContactsStore } from "@/stores/contacts";

import { getContactColumns } from "./contact-columns";
import { ContactDetailSheet } from "./contact-detail-sheet";
import { ContactFormSheet } from "./contact-form-sheet";
import { ContactsClientCards } from "./contacts-client-cards";
import { ContactsClientHeader } from "./contacts-client-header";

interface Props {
  initialData: Contact[];
  dictionary: Dictionary;
}

type ContactsFilters = { q: string };

export function ContactsClient({ initialData, dictionary }: Props) {
  const { columns, setColumns } = useContactsStore();
  const { workspace } = useAppStore();
  const canEditData = canEditWorkspaceData(workspace?.current_user_role);

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const { filters, handleFilterChange } = useDataTableFilter<ContactsFilters>({
    initialFilters: { q: "" },
    pageSize: 50,
    initialPage: 0,
  });

  const [mountFilters] = useState(filters);
  const isInitial = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(mountFilters),
    [filters, mountFilters],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
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
    initialData: isInitial
      ? {
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
        }
      : undefined,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const allContacts = useMemo(() => data?.pages?.flatMap((p) => p.data ?? []) ?? [], [data]);

  // Card metrics — derived from the loaded contacts
  const cardMetrics = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    let addedThisMonth = 0;
    let withEmail = 0;
    let withPhone = 0;
    for (const c of allContacts) {
      if (c.createdAt && c.createdAt >= thisMonthStart) addedThisMonth += 1;
      if (c.email?.trim()) withEmail += 1;
      if (c.phone?.trim()) withPhone += 1;
    }
    return { addedThisMonth, withEmail, withPhone };
  }, [allContacts]);

  const handleEdit = useCallback((contact: Contact) => {
    setEditContact(contact);
    setIsFormSheetOpen(true);
  }, []);

  const handleRowClick = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailSheetOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditContact(null);
    setIsFormSheetOpen(true);
  }, []);

  const tableColumns = useMemo(
    () => getContactColumns(handleEdit, dictionary),
    [handleEdit, dictionary],
  );

  return (
    <div className="flex h-full w-full flex-col space-y-4">
      <ContactsClientCards
        total={allContacts.length}
        addedThisMonth={cardMetrics.addedThisMonth}
        withEmail={cardMetrics.withEmail}
        withPhone={cardMetrics.withPhone}
        isLoading={isLoading}
        dictionary={dictionary}
      />

      <ContactsClientHeader
        filters={filters as ContactsFilters}
        onFilterChange={handleFilterChange}
        columns={columns}
        onAdd={handleCreate}
        canEditData={canEditData}
        dictionary={dictionary}
      />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={tableColumns}
            rowCount={20}
            stickyColumnIds={["name"]}
            actionsColumnId="actions"
          />
        ) : (
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
                action={
                  canEditData
                    ? { label: dictionary.contacts.empty.action, onClick: handleCreate }
                    : undefined
                }
              />
            }
            infiniteScroll={true}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            meta={{ onRowClick: handleRowClick }}
          />
        )}
      </div>

      <ContactFormSheet
        open={isFormSheetOpen}
        onClose={() => {
          setIsFormSheetOpen(false);
          setEditContact(null);
        }}
        contact={editContact}
        dictionary={dictionary}
        canEdit={canEditData}
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
