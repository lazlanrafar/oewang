export function TransactionsWireframe() {
  const transactions = [
    {
      name: "Xendit Payment",
      amount: "+$2,450.00",
      type: "Income",
      color: "bg-green-500",
    },
    {
      name: "AWS",
      amount: "-$299.00",
      type: "Infrastructure",
      color: "bg-muted-foreground/20",
    },
    {
      name: "Figma",
      amount: "-$24.00",
      type: "Software",
      color: "bg-muted-foreground/20",
    },
    {
      name: "Client Invoice",
      amount: "+$8,500.00",
      type: "Income",
      color: "bg-green-500",
    },
    {
      name: "Adobe",
      amount: "-$649.00",
      type: "Software",
      color: "bg-muted-foreground/20",
    },
  ];

  return (
    <div className="border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="w-32 h-4 rounded bg-muted-foreground/20" />
        <div className="flex gap-2">
          <div className="w-16 h-6 rounded bg-muted-foreground/10" />
          <div className="w-16 h-6 rounded bg-muted-foreground/10" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20">
        <div className="w-48 h-6 rounded bg-muted-foreground/10" />
        <div className="w-24 h-6 rounded bg-muted-foreground/10" />
        <div className="w-24 h-6 rounded bg-muted-foreground/10" />
      </div>

      {/* Table */}
      <div className="divide-y divide-border">
        {transactions.map((tx, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`w-1 h-8 rounded ${tx.color}`} />
              <div>
                <div className="w-32 h-3 rounded bg-muted-foreground/20 mb-1" />
                <div className="w-20 h-2 rounded bg-muted-foreground/10" />
              </div>
            </div>
            <div className="text-right">
              <div className="w-20 h-3 rounded bg-muted-foreground/20 mb-1 ml-auto" />
              <div className="w-16 h-2 rounded bg-muted-foreground/10 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
