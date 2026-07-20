import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "EnergyPulse",
  description:
    "Energi, lagkrav och klimatrisk för fastighetsportföljen – för tekniska förvaltare",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" className="dark">
      <body className="min-h-screen bg-terminal-bg text-foreground">
        <QueryProvider>
          <TooltipProvider delayDuration={200}>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
