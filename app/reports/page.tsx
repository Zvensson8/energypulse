import { Suspense } from "react";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata = {
  title: "Rapporter · EnergyPulse",
  description:
    "PDF till ledning, CSRD, fastighet och renovationsplaner",
};

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <div className="page-inner">
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Laddar rapporter…
            </div>
          </div>
        </div>
      }
    >
      <ReportsView />
    </Suspense>
  );
}
