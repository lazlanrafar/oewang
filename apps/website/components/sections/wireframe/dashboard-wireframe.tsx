export function DashboardWireframe() {
  const chartBars = [40, 60, 45, 80, 65, 90, 75].map((height, index) => ({
    height,
    id: `bar-${height}-${index}`,
  }));

  return (
    <div className="overflow-hidden border border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-border border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 bg-muted-foreground/20" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-24 bg-muted-foreground/20" />
            <div className="h-3 w-4 bg-muted-foreground/10" />
          </div>
        </div>
        <div className="h-3 w-24 bg-muted-foreground/10" />
      </div>

      {/* Body */}
      <div className="flex">
        {/* Sidebar */}
        <div className="w-40 space-y-2 border-border border-r bg-muted/20 p-4">
          <div className="h-6 w-full bg-muted-foreground/10" />
          <div className="h-4 w-3/4 bg-muted-foreground/10" />
          <div className="h-4 w-2/3 bg-muted-foreground/10" />
          <div className="h-4 w-4/5 bg-muted-foreground/10" />
          <div className="h-6 w-full bg-muted-foreground/10" />
          <div className="h-4 w-3/4 bg-muted-foreground/10" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 p-4">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="h-16 border border-border bg-muted/10 p-2">
              <div className="mb-2 h-2 w-10 bg-muted-foreground/10" />
              <div className="h-4 w-12 bg-muted-foreground/20" />
            </div>
            <div className="h-16 border border-border bg-muted/10 p-2">
              <div className="mb-2 h-2 w-10 bg-muted-foreground/10" />
              <div className="h-4 w-12 bg-muted-foreground/20" />
            </div>
            <div className="h-16 border border-border bg-muted/10 p-2">
              <div className="mb-2 h-2 w-10 bg-muted-foreground/10" />
              <div className="h-4 w-12 bg-muted-foreground/20" />
            </div>
            <div className="h-16 border border-border bg-muted/10 p-2">
              <div className="mb-2 h-2 w-10 bg-muted-foreground/10" />
              <div className="h-4 w-12 bg-muted-foreground/20" />
            </div>
          </div>

          {/* Lightweight chart mock for the marketing dashboard preview. */}
          <div className="h-32 border border-border bg-muted/10 p-3">
            <div className="flex h-full items-end justify-between gap-1">
              {chartBars.map((bar) => (
                <div
                  key={bar.id}
                  className="flex-1 bg-muted-foreground/20"
                  style={{ height: `${bar.height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
