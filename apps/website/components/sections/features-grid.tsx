import { BarChart3, Bell, FileText, Globe2, Receipt, ShieldCheck, Tag, Users, Wallet, Zap } from "lucide-react";

const INTEGRATIONS = [
  { label: "Wallets", icon: Wallet },
  { label: "Transactions", icon: Receipt },
  { label: "Charts", icon: BarChart3 },
  { label: "Categories", icon: Tag },
  { label: "Multi-currency", icon: Globe2 },
  { label: "Security", icon: ShieldCheck },
  { label: "Notifications", icon: Bell },
  { label: "Documents", icon: FileText },
  { label: "Shared Access", icon: Users },
  { label: "Fast Sync", icon: Zap },
];

export function FeaturesGridSection() {
  return (
    <section className="border-border border-t bg-background py-24">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-serif text-3xl text-foreground tracking-tight sm:text-4xl">
            Everything in one place
          </h2>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground">
            One connected home for your accounts, categories, and money habits.
          </p>
        </div>

        <div className="grid grid-cols-2 border-border border-t border-l sm:grid-cols-3 lg:grid-cols-5">
          {INTEGRATIONS.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-3 border-border border-r border-b p-8 text-center transition-colors hover:bg-muted/30"
            >
              <div className="flex size-10 items-center justify-center border border-border">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
