import * as React from "react";
import { Button } from "../../atoms/button";
import { Plus } from "lucide-react";
import { cn } from "../../../lib/utils";

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
    <div className={cn("flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300", className)}>
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/30 mb-6">
        {icon || <Plus className="h-10 w-10 text-muted-foreground/40" />}
      </div>
      <h3 className="text-xl font-serif font-medium tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[280px] mb-8">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} variant="outline" size="sm" className="h-9 px-4 rounded-none">
          <Plus className="h-4 w-4 mr-2" />
          {action.label}
        </Button>
      )}
    </div>
  );
}
