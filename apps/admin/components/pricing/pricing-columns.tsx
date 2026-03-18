"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Pricing } from "@workspace/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Badge,
} from "@workspace/ui";
import {
  MoreHorizontal,
  Trash,
  Edit,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { deletePricingAction, updatePricingAction } from "@workspace/modules/pricing/pricing.action";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePricingStore } from "@/stores/pricing";
import React from "react";

const CellActions = ({ row }: { row: { original: Pricing } }) => {
  const pricing = row.original;
  const router = useRouter();
  const { openEdit } = usePricingStore();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleToggleActive = async () => {
    setIsLoading(true);
    try {
      const result = await updatePricingAction(pricing.id, {
        is_active: !pricing.is_active,
      });
      if (result.success) {
        toast.success(
          `Pricing plan ${pricing.is_active ? "deactivated" : "activated"}`,
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this pricing plan?")) return;
    setIsLoading(true);
    try {
      const result = await deletePricingAction(pricing.id);
      if (result.success) {
        toast.success("Pricing plan deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openEdit(pricing)}>
          <Edit className="mr-2 h-4 w-4" />
          <span>Edit Plan</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleToggleActive} disabled={isLoading}>
          {pricing.is_active ? (
            <>
              <XCircle className="mr-2 h-4 w-4 text-destructive" />
              <span>Deactivate</span>
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4 text-success" />
              <span>Activate</span>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive"
          disabled={isLoading}
        >
          <Trash className="mr-2 h-4 w-4" />
          <span>Delete Plan</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const pricingColumns: ColumnDef<Pricing>[] = [
  {
    accessorKey: "name",
    header: "Name",
    size: 200,
    minSize: 120,
    maxSize: 400,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Name",
      className:
        "w-[200px] min-w-[120px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
    },
    cell: ({ getValue }) => (
      <span className="truncate font-medium">{getValue<string>()}</span>
    ),
  },
  {
    id: "prices_summary",
    accessorFn: (row) => row.prices,
    header: "Pricing (Base USD)",
    size: 200,
    minSize: 150,
    maxSize: 300,
    enableResizing: true,
    meta: {
      headerLabel: "Pricing",
      className: "w-[200px] min-w-[150px]",
    },
    cell: ({ getValue }) => {
      const prices = getValue<Pricing["prices"]>();
      if (!prices || prices.length === 0) return <span className="text-muted-foreground italic">Free</span>;
      
      const basePrice = prices.find((p) => p.currency.toLowerCase() === "usd") || prices[0];
      
      if (!basePrice || (basePrice.monthly === 0 && basePrice.yearly === 0)) {
        return <span className="text-muted-foreground italic">Free</span>;
      }

      return (
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">${(basePrice.monthly / 100).toFixed(2)} / mo</span>
          <span className="text-xs text-muted-foreground">${(basePrice.yearly / 100).toFixed(2)} / yr</span>
        </span>
      );
    },
  },
  {
    accessorKey: "is_active",
    header: "Status",
    size: 120,
    minSize: 90,
    maxSize: 200,
    enableResizing: true,
    meta: {
      headerLabel: "Status",
      className: "w-[120px] min-w-[90px]",
    },
    cell: ({ getValue }) => {
      const isActive = getValue<boolean>();
      return (
        <Badge variant={isActive ? "success" : "secondary"}>
          {isActive ? "Active" : "Inactive"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    size: 160,
    minSize: 120,
    maxSize: 260,
    enableResizing: true,
    meta: {
      headerLabel: "Created At",
      className: "w-[160px] min-w-[120px]",
    },
    cell: ({ getValue }) => {
      const val = getValue<string>();
      if (!val) return "N/A";
      return new Date(val).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    },
  },
  {
    id: "actions",
    size: 90,
    enableHiding: false,
    meta: {
      headerLabel: "Actions",
    },
    cell: ({ row }) => <CellActions row={row} />,
  },
];
