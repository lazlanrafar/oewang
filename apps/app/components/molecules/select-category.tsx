"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCategory, getCategories } from "@workspace/modules/client";
import { Combobox, cn, Spinner } from "@workspace/ui";
import { toast } from "sonner";

export interface SelectCategoryProps {
  value?: string;
  type?: "income" | "expense";
  onChange: (categoryId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  headless?: boolean;
  hideLoading?: boolean;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
  inDataTable?: boolean;
}

const CategoryColor = ({ type, color }: { type: string; color?: string }) => (
  <div
    className={cn(
      "h-2.5 w-2.5 shrink-0 rounded-[2px]",
      color ? `bg-${color}` : type === "income" ? "bg-emerald-500" : "bg-red-500",
    )}
  />
);

export function SelectCategory({
  value,
  type,
  onChange,
  className,
  disabled,
  placeholder = "Select category",
  headless,
  hideLoading,
  variant,
  inDataTable,
}: SelectCategoryProps) {
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", type || "all"],
    queryFn: async () => {
      const res = await getCategories(type);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await createCategory({ name, type: type || "expense" });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        onChange(data.id);
        queryClient.invalidateQueries({
          queryKey: ["categories", type || "all"],
        });
        toast.success(`Category "${data.name}" created`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create category");
    },
  });

  const selectedCategory = categories.find((c) => c.id === value);
  const selectedValue = selectedCategory
    ? {
        id: selectedCategory.id,
        label: selectedCategory.name,
      }
    : undefined;

  const items = categories.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  if (!selectedValue && isLoading && !hideLoading) {
    return (
      <div className="flex h-full min-h-[40px] w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Combobox
      variant={variant}
      headless={headless}
      disabled={disabled || createMutation.isPending}
      placeholder={placeholder}
      searchPlaceholder="Search category"
      items={items}
      selectedItem={selectedValue}
      onSelect={(item) => {
        onChange(item.id);
      }}
      triggerClassName={cn(inDataTable && "max-w-[280px]", className)}
      showChevron={!inDataTable}
      className="rounded-none"
      onCreate={(value) => {
        createMutation.mutate(value);
      }}
      renderSelectedItem={(item) => (
        <div className="flex items-center space-x-2">
          <CategoryColor type={selectedCategory?.type || type || "expense"} />
          <span className="max-w-[90%] truncate text-left font-medium">{!Array.isArray(item) ? item.label : ""}</span>
        </div>
      )}
      renderOnCreate={(value) => (
        <div className="flex items-center space-x-2">
          <CategoryColor type={type || "expense"} />
          <span>{`Create "${value}"`}</span>
        </div>
      )}
      renderListItem={({ item }) => {
        const cat = categories.find((c) => c.id === item.id);
        return (
          <div className="flex items-center space-x-2 py-1">
            <CategoryColor type={cat?.type || type || "expense"} />
            <span className="line-clamp-1 font-medium">{item.label}</span>
          </div>
        );
      }}
    />
  );
}
