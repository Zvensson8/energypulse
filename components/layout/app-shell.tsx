"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Search,
  LogOut,
  LogIn,
  LineChart,
  MapPinned,
  BookOpen,
  Leaf,
  Upload,
  ListTodo,
  Settings2,
  DoorOpen,
  AlertTriangle,
  Pencil,
  Activity,
  Hammer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command/command-palette";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { APP_TAGLINE } from "@/lib/labels";

const NAV = [
  {
    href: "/dashboard",
    label: "Översikt",
    short: "Översikt",
    icon: LayoutDashboard,
  },
  {
    href: "/properties",
    label: "Fastigheter",
    short: "Fastigheter",
    icon: MapPinned,
  },
  {
    href: "/buildings",
    label: "Byggnader",
    short: "Byggnader",
    icon: Building2,
  },
  {
    href: "/spaces",
    label: "Lokaler",
    short: "Lokaler",
    icon: DoorOpen,
  },
  {
    href: "/import",
    label: "Importera",
    short: "Import",
    icon: Upload,
  },
  {
    href: "/actions",
    label: "Åtgärder",
    short: "Åtgärder",
    icon: ListTodo,
  },
  {
    href: "/risks",
    label: "Fysrisk",
    short: "Risk",
    icon: AlertTriangle,
  },
  {
    href: "/risk-scores",
    label: "Riskscore",
    short: "Score",
    icon: Activity,
  },
  {
    href: "/renovation",
    label: "Renovering",
    short: "Renov",
    icon: Hammer,
  },
  {
    href: "/crrem",
    label: "Klimatrisk",
    short: "Klimatrisk",
    icon: LineChart,
  },
  {
    href: "/guide",
    label: "Guide",
    short: "Guide",
    icon: BookOpen,
  },
  {
    href: "/data-edit",
    label: "Data",
    short: "Data",
    icon: Pencil,
  },
  {
    href: "/admin",
    label: "Admin",
    short: "Admin",
    icon: Settings2,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const isLogin = pathname.startsWith("/login");

  useEffect(() => {
    const supabase = getBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLogin) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLogin]);

  async function logout() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (isLogin) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-terminal-bg">
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-terminal-bg">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-terminal-border bg-terminal-panel px-3 shadow-sm sm:gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 pr-1 sm:pr-3"
          title={APP_TAGLINE}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-terminal-accent/15 text-terminal-accent">
            <Leaf className="h-3.5 w-3.5" />
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold tracking-tight text-foreground">
              EnergyPulse
            </div>
            <div className="text-[10px] text-terminal-muted">
              Energi & klimatrisk
            </div>
          </div>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => {
            const active =
              item.href === "/guide"
                ? pathname.startsWith("/guide")
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-terminal-accent/15 text-terminal-accent"
                    : "text-terminal-muted hover:bg-terminal-row hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{item.label}</span>
                <span className="md:hidden">{item.short}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {email && (
            <span
              className="hidden max-w-[10rem] truncate text-2xs text-terminal-muted lg:inline"
              title={email}
            >
              {email}
            </span>
          )}
          <Button
            variant="terminal"
            size="sm"
            onClick={() => setCmdOpen(true)}
            className="h-8 gap-1.5 text-xs text-terminal-muted"
            title="Sök i beståndet (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sök</span>
            <kbd className="hidden rounded border border-terminal-border bg-terminal-bg px-1 text-[10px] sm:inline">
              Ctrl+K
            </kbd>
          </Button>
          {email ? (
            <Button
              variant="terminal"
              size="sm"
              onClick={() => void logout()}
              className="h-8 gap-1 text-xs"
              title="Logga ut"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logga ut</span>
            </Button>
          ) : (
            <Button
              variant="terminal"
              size="sm"
              asChild
              className="h-8 gap-1 text-xs"
            >
              <Link href="/login">
                <LogIn className="h-3.5 w-3.5" />
                Logga in
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
