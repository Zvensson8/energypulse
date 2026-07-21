"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
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
  AlertTriangle,
  Pencil,
  Activity,
  Hammer,
  Menu,
  X,
  Home,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command/command-palette";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Start",
    items: [
      { href: "/", label: "Hem", icon: Home, hint: "Vad vill du göra?" },
      {
        href: "/dashboard",
        label: "Översikt",
        icon: LayoutDashboard,
        hint: "Portföljens läge",
      },
    ],
  },
  {
    title: "Hitta data",
    items: [
      {
        href: "/properties",
        label: "Fastigheter",
        icon: MapPinned,
      },
      { href: "/risk-scores", label: "Riskscore", icon: Activity },
      { href: "/crrem", label: "Klimatrisk (CRREM)", icon: LineChart },
    ],
  },
  {
    title: "Mata in & agera",
    items: [
      {
        href: "/import",
        label: "Importera energi",
        icon: Upload,
        hint: "CSV / Excel",
      },
      {
        href: "/actions",
        label: "Åtgärder",
        icon: ListTodo,
        hint: "Simulera & slutför",
      },
      { href: "/renovation", label: "Renovationsplaner", icon: Hammer },
      { href: "/risks", label: "Riskregister", icon: AlertTriangle },
    ],
  },
  {
    title: "Mer",
    items: [
      { href: "/guide", label: "Guide", icon: BookOpen },
      { href: "/data-edit", label: "Korrigera data", icon: Pencil },
      { href: "/admin", label: "Admin", icon: Settings2 },
    ],
  },
];

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/": {
    title: "Hem",
    subtitle: "Betyg → simulera → plan → beslutsunderlag",
  },
  "/dashboard": {
    title: "Portföljöversikt",
    subtitle: "Energi, krav och risk i hela beståndet",
  },
  "/properties": {
    title: "Fastigheter",
  },
  "/buildings": {
    title: "Byggnad",
    subtitle: "Betyg, plan och beslutsunderlag",
  },
  "/import": {
    title: "Importera energidata",
    subtitle: "Ladda upp CSV eller Excel – vi validerar och räknar om",
  },
  "/actions": {
    title: "Åtgärder",
    subtitle: "Prioritera, simulera effekt och markera som klar",
  },
  "/risk-scores": {
    title: "Kombinerad risk",
    subtitle: "MEPS + CRREM + fysisk risk + datakvalitet",
  },
  "/renovation": {
    title: "Renovationsplaner",
    subtitle: "Paketera åtgärder mot MEPS och klimatriskår",
  },
  "/guide": { title: "Guide", subtitle: "Kom igång på några minuter" },
  "/admin": {
    title: "Admin",
    subtitle: "Riskvikter, datakvalitet och behörigheter",
  },
  "/login": { title: "Logga in" },
};

function matchTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const key = Object.keys(PAGE_TITLES)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key
    ? PAGE_TITLES[key]
    : { title: "EnergyPulse", subtitle: undefined };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLogin = pathname.startsWith("/login");
  const page = useMemo(() => matchTitle(pathname), [pathname]);

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
    setMobileOpen(false);
  }, [pathname]);

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
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Leaf className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight">
            EnergyPulse
          </div>
          <div className="truncate text-xs text-muted-foreground">
            Energi · MEPS · CRREM
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-secondary"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1">Sök bestånd…</span>
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "nav-item",
                      active && "nav-item-active"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && !active && (
                      <span className="hidden truncate text-[10px] text-muted-foreground/70 xl:inline">
                        {item.hint}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-emerald-500/10 p-3">
          <div className="text-xs font-semibold text-foreground">
            Snabbstart
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            1. Importera · 2. Se risk · 3. Simulera åtgärd
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="h-8 flex-1 text-xs" asChild>
              <Link href="/import">Importera</Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-xs"
              asChild
            >
              <Link href="/actions">Åtgärder</Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
            {(email?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">
              {email ?? "Ej inloggad"}
            </div>
          </div>
          {email ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void logout()}
              title="Logga ut"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" asChild title="Logga in">
              <Link href="/login">
                <LogIn className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(100%,18rem)] border-r border-border bg-card shadow-soft">
            <div className="flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                EnergyPulse
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="truncate font-medium text-foreground">
                {page.title}
              </span>
            </div>
            {page.subtitle && (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {page.subtitle}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setCmdOpen(true)}
          >
            <Search className="h-4 w-4" />
            Sök
          </Button>
          <Button size="sm" asChild>
            <Link href="/import">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Importera</span>
            </Link>
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
