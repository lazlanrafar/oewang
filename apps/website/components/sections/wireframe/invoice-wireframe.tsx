export function InvoiceWireframe() {
  return (
    <div className="overflow-hidden border border-border">
      {/* Invoice content */}
      <div className="space-y-6 bg-background p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 h-6 w-24 rounded bg-muted-foreground/20" />
            <div className="h-3 w-32 rounded bg-muted-foreground/10" />
          </div>
          <div className="text-right">
            <div className="mb-2 h-8 w-16 rounded bg-muted-foreground/10" />
            <div className="h-3 w-24 rounded bg-muted-foreground/10" />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* From/To */}
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="mb-2 h-2 w-12 rounded bg-muted-foreground/10" />
            <div className="mb-1 h-3 w-full rounded bg-muted-foreground/10" />
            <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
          </div>
          <div>
            <div className="mb-2 h-2 w-8 rounded bg-muted-foreground/10" />
            <div className="mb-1 h-3 w-full rounded bg-muted-foreground/10" />
            <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
          </div>
        </div>

        {/* Table */}
        <div className="border border-border">
          <div className="grid grid-cols-4 gap-4 border-border border-b bg-muted/20 p-3">
            <div className="h-2 w-12 rounded bg-muted-foreground/20" />
            <div className="h-2 w-8 rounded bg-muted-foreground/20" />
            <div className="h-2 w-8 rounded bg-muted-foreground/20" />
            <div className="h-2 w-12 rounded bg-muted-foreground/20" />
          </div>
          <div className="grid grid-cols-4 gap-4 p-3">
            <div className="h-3 w-full rounded bg-muted-foreground/10" />
            <div className="h-3 w-full rounded bg-muted-foreground/10" />
            <div className="h-3 w-full rounded bg-muted-foreground/10" />
            <div className="h-3 w-full rounded bg-muted-foreground/10" />
          </div>
        </div>

        {/* Total */}
        <div className="flex justify-end">
          <div className="w-40">
            <div className="mb-1 flex justify-between">
              <div className="h-3 w-16 rounded bg-muted-foreground/10" />
              <div className="h-3 w-16 rounded bg-muted-foreground/10" />
            </div>
            <div className="flex justify-between">
              <div className="h-4 w-16 rounded bg-muted-foreground/20" />
              <div className="h-4 w-16 rounded bg-muted-foreground/30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
