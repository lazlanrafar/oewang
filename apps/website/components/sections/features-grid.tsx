import {
  BarChart3,
  Wallet,
  Receipt,
  ShieldCheck,
  Globe2,
  Zap,
  Bell,
  FileText,
  Users,
  Tag,
} from "lucide-react";

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
    <section className="bg-background border-t border-border py-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground mb-4">
            Everything in one place
          </h2>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            One connected home for your accounts, categories, and money habits.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-l border-t border-border">
          {INTEGRATIONS.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="border-r border-b border-border p-8 flex flex-col items-center gap-3 text-center hover:bg-muted/30 transition-colors"
            >
              <div className="size-10 border border-border flex items-center justify-center">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
