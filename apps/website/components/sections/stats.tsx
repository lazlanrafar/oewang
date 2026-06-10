const STATS = [
  { value: "150+", label: "Currencies supported" },
  { value: "<100ms", label: "Average response time" },
  { value: "AES-256", label: "Encryption standard" },
  { value: "99.9%", label: "Uptime SLA" },
];

export function StatsSection() {
  return (
    <section className="border-border border-y bg-background">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-4 lg:divide-y-0">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <span className="font-serif text-3xl text-foreground sm:text-4xl">{stat.value}</span>
              <span className="text-muted-foreground text-xs uppercase tracking-widest">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
