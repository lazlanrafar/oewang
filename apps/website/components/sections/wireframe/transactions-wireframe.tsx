export function TransactionsWireframe() {
  const transactions = [
    {
      name: "Monthly Salary",
      amount: "+$3,200.00",
      type: "Income",
      color: "bg-green-500",
    },
    {
      name: "Apartment Rent",
      amount: "-$980.00",
      type: "Housing",
      color: "bg-muted-foreground/20",
    },
    {
      name: "Groceries",
      amount: "-$84.00",
      type: "Food",
      color: "bg-muted-foreground/20",
    },
    {
      name: "Freelance Project",
      amount: "+$620.00",
      type: "Income",
      color: "bg-green-500",
    },
    {
      name: "Gym Membership",
      amount: "-$39.00",
      type: "Health",
      color: "bg-muted-foreground/20",
    },
  ];

  return (
    <div className="overflow-hidden border border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-border border-b bg-muted/30 px-4 py-3">
        <div className="h-4 w-32 rounded bg-muted-foreground/20" />
        <div className="flex gap-2">
          <div className="h-6 w-16 rounded bg-muted-foreground/10" />
          <div className="h-6 w-16 rounded bg-muted-foreground/10" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 border-border border-b bg-muted/20 px-4 py-2">
        <div className="h-6 w-48 rounded bg-muted-foreground/10" />
        <div className="h-6 w-24 rounded bg-muted-foreground/10" />
        <div className="h-6 w-24 rounded bg-muted-foreground/10" />
      </div>

      {/* Table */}
      <div className="divide-y divide-border">
        {transactions.map((tx) => (
          <div key={`${tx.name}-${tx.amount}`} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-1 rounded ${tx.color}`} />
              <div>
                <div className="mb-1 h-3 w-32 rounded bg-muted-foreground/20" />
                <div className="h-2 w-20 rounded bg-muted-foreground/10" />
              </div>
            </div>
            <div className="text-right">
              <div className="mb-1 ml-auto h-3 w-20 rounded bg-muted-foreground/20" />
              <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
