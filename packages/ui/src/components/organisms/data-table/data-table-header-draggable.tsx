"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { TableHead } from "../../atoms";
import { cn } from "../../../lib/utils";

interface DraggableHeaderProps {
  id: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

export function DataTableHeaderDraggable({
  id,
  children,
  className,
  style,
  disabled = false,
}: DraggableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  const dragStyle: CSSProperties = {
    // Use Translate instead of Transform to avoid scaling content
    transform: CSS.Translate.toString(transform),
    transition,
    ...style,
  };

  return (
    <TableHead
      ref={setNodeRef}
      className={cn(
        "group/header relative h-full px-4 border-t border-border flex items-center select-none",
        "shadow-none outline-none ring-0 focus:shadow-none focus:outline-none focus:ring-0 hover:shadow-none",
        isDragging && "border border-border bg-background z-50",
        className,
      )}
      style={dragStyle}
    >
      <div className="w-full flex-1 min-w-0 overflow-hidden">{children}</div>
      {!disabled && (
        <GripVertical
          size={14}
          className="absolute right-1 text-muted-foreground opacity-0 group-hover/header:opacity-100 shrink-0 cursor-grab active:cursor-grabbing z-30"
          {...attributes}
          {...listeners}
        />
      )}
    </TableHead>
  );
}
