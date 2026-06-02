const STATS = [
  { value: "150+", label: "Currencies supported" },
  { value: "<100ms", label: "Average response time" },
  { value: "AES-256", label: "Encryption standard" },
  { value: "99.9%", label: "Uptime SLA" },
];

export function StatsSection() {
  return (
    <section className="border-y border-border bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
              <span className="font-serif text-3xl sm:text-4xl text-foreground">{stat.value}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-widest">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
