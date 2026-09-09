"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Cpu, Activity, Terminal, ShieldAlert } from "lucide-react";
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
    description: "FastAPI sidecar token usage and embeddings",
  },
  {
    title: "System Logs & Health",
    href: "/developer/system-logs",
    icon: Activity,
    description: "Check background worker and API service health",
  },
];

export function DeveloperLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full lg:w-64 shrink-0">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-center gap-2 border-b pb-3 font-semibold text-sm">
            <Terminal className="size-4 text-primary" />
            <span>Developer Center</span>
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
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
