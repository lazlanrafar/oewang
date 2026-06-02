export function DashboardWireframe() {
  return (
    <div className="border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded bg-muted-foreground/20" />
          <div className="flex items-center gap-2">
            <div className="w-24 h-3 rounded bg-muted-foreground/20" />
            <div className="w-4 h-3 rounded bg-muted-foreground/10" />
          </div>
        </div>
        <div className="w-24 h-3 rounded bg-muted-foreground/10" />
      </div>

      {/* Body */}
      <div className="flex">
        {/* Sidebar */}
        <div className="w-40 border-r border-border p-4 space-y-2 bg-muted/20">
          <div className="w-full h-6 rounded bg-muted-foreground/10" />
          <div className="w-3/4 h-4 rounded bg-muted-foreground/10" />
          <div className="w-2/3 h-4 rounded bg-muted-foreground/10" />
          <div className="w-4/5 h-4 rounded bg-muted-foreground/10" />
          <div className="w-full h-6 rounded bg-muted-foreground/10" />
          <div className="w-3/4 h-4 rounded bg-muted-foreground/10" />
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="h-16 rounded border border-border bg-muted/10 p-2">
              <div className="w-10 h-2 rounded bg-muted-foreground/10 mb-2" />
              <div className="w-12 h-4 rounded bg-muted-foreground/20" />
            </div>
            <div className="h-16 rounded border border-border bg-muted/10 p-2">
              <div className="w-10 h-2 rounded bg-muted-foreground/10 mb-2" />
              <div className="w-12 h-4 rounded bg-muted-foreground/20" />
            </div>
            <div className="h-16 rounded border border-border bg-muted/10 p-2">
              <div className="w-10 h-2 rounded bg-muted-foreground/10 mb-2" />
              <div className="w-12 h-4 rounded bg-muted-foreground/20" />
            </div>
            <div className="h-16 rounded border border-border bg-muted/10 p-2">
              <div className="w-10 h-2 rounded bg-muted-foreground/10 mb-2" />
              <div className="w-12 h-4 rounded bg-muted-foreground/20" />
            </div>
          </div>

          {/* Chart placeholder */}
          <div className="h-32 rounded border border-border bg-muted/10 p-3">
            <div className="flex items-end justify-between h-full gap-1">
              {[40, 60, 45, 80, 65, 90, 75].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-muted-foreground/20" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
