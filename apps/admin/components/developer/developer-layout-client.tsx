"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Cpu, Terminal } from "lucide-react";
import { cn } from "@workspace/ui";

const navItems = [
  {
    title: "Push Notifications",
    href: "/developer/push-notifications",
    icon: Bell,
    description: "Test FCM, APNs, and Web Push notifications",
  },
  {
    title: "AI Usage & Metrics",
    href: "/developer/ai-usage",
    icon: Cpu,
    description: "FastAPI sidecar token usage, latency, and costs",
  },
];

export function DeveloperLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row overflow-hidden">
      <aside className="w-full lg:w-60 shrink-0 h-full overflow-y-auto pr-2">
        <div className="mb-3 flex items-center gap-2 border-b pb-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
          <Terminal className="size-3.5 text-primary" />
          <span>Developer Tools</span>
        </div>
        <nav className="flex flex-col space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.endsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors border-l-2",
                  isActive
                    ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground [background-image:repeating-linear-gradient(45deg,transparent_0_5px,color-mix(in_srgb,var(--chart-pattern-stroke)_5%,transparent)_5px_6px)]"
                    : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 h-full min-h-0 overflow-y-auto pl-0 lg:pl-2">
        {children}
      </main>
    </div>
  );
}
