"use client";

import { Column } from "@tanstack/react-table";
import {
  Button,
  Checkbox,
  Icons,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../atoms";
import { getHeaderLabel } from "./data-table-types";

export function DataTableColumnsVisibility({
  columns,
}: {
  columns: Column<any, unknown>[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <Icons.Tune size={18} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[200px] p-0" align="end" sideOffset={8}>
        <div className="flex flex-col p-4 space-y-2 max-h-[352px] overflow-auto">
          {columns
            .filter((column) => column.columnDef.enableHiding !== false)
            .map((column) => {
              return (
                <div key={column.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) =>
                      column.toggleVisibility(checked === true)
                    }
                  />
                  <label
                    htmlFor={column.id}
                    className="text-sm peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {getHeaderLabel(column.columnDef)}
                  </label>
                </div>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
