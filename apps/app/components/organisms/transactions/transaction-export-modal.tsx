"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Calendar,
} from "@workspace/ui";

import { exportTransactions } from "@workspace/modules/transaction/transaction.action";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const [exportType, setExportType] = useState<"all" | "custom">("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
    from: undefined,
    to: undefined,
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (exportType === "custom" && (!dateRange.from || !dateRange.to)) {
      toast.error("Please select both start and end dates.");
      return;
    }

    setIsExporting(true);
    try {
      const params =
        exportType === "all"
          ? { allData: "true" }
          : {
              startDate: dateRange.from?.toISOString(),
              endDate: dateRange.to?.toISOString(),
            };

      const res = await exportTransactions(params);

      if (res.success && res.data) {
        // Create a blob URL and trigger download
        const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute(
          "download",
          `transactions_export_${format(new Date(), "yyyy-MM-dd")}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success("Transactions exported successfully.");
        onOpenChange(false);
      } else {
        toast.error(res.error || "Failed to export transactions.");
      }
    } catch (error) {
      toast.error("An unexpected error occurred during export.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Transactions</DialogTitle>
          <DialogDescription>
            Download your transactions as a CSV file. Choose to export all data or select a specific date range.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <RadioGroup
            value={exportType}
            onValueChange={(val: "all" | "custom") => setExportType(val)}
            className="flex flex-col space-y-3"
          >
            <div className="flex items-center space-x-3 space-y-0">
              <RadioGroupItem value="all" id="all" />
              <Label htmlFor="all" className="font-normal">
                All data
              </Label>
            </div>
            <div className="flex items-center space-x-3 space-y-0">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="font-normal">
                Custom date range
              </Label>
            </div>
          </RadioGroup>

          {exportType === "custom" && (
            <div className="grid gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
