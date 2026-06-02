import { Plus } from "lucide-react";
import type * as React from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../../atoms/button";

interface DataTableEmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function DataTableEmptyState({
  title,
  description,
  action,
  icon,
  className,
}: DataTableEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300",
        className,
      )}
    >
      <h3 className="text-xl font-serif font-medium tracking-tight mb-2">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-[280px] mb-8">
        {description}
      </p>
      {action && (
        <Button
          onClick={action.onClick}
          variant="outline"
          size="sm"
          className="rounded-none"
        >
          <Plus className="h-4 w-4 mr-2" />
          {action.label}
        </Button>
      )}
    </div>
  );
}
