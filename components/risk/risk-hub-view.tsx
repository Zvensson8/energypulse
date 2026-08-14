"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle } from "lucide-react";
import { RiskScoresView } from "@/components/risk/risk-scores-view";
import { PhysicalRisksView } from "@/components/risks/physical-risks-view";
import { cn } from "@/lib/utils";

export type RiskDel = "fastighet" | "ytter";

export function RiskHubView({
  lockedPropertyId,
  embedded = false,
  initialDel = "fastighet",
}: {
  lockedPropertyId?: string;
  embedded?: boolean;
  initialDel?: RiskDel;
} = {}) {
  const router = useRouter();
  const [del, setDel] = useState<RiskDel>(initialDel);

  function choose(next: RiskDel) {
    setDel(next);
    if (embedded) return;
    const qs = next === "ytter" ? "del=ytter" : "";
    router.replace(qs ? `/risk-scores?${qs}` : "/risk-scores", {
      scroll: false,
    });
  }

  return (
    <div className={embedded ? "space-y-4" : "page-shell"}>
      <div className={embedded ? "space-y-4" : "page-inner"}>
        {!embedded && (
          <div>
            <h1 className="page-title">Risk</h1>
            <p className="page-subtitle">
              Fastighet: energi, krav 2030 och klimatriskår (0–100). Yttre:
              översvämning, värme, sättning. Komponentrisk visas på fastigheten.
            </p>
          </div>
        )}

        <div className="flex gap-1 rounded-2xl border border-border bg-card p-1.5">
          <SegBtn
            active={del === "fastighet"}
            onClick={() => choose("fastighet")}
            icon={Activity}
            label="Fastighet"
          />
          <SegBtn
            active={del === "ytter"}
            onClick={() => choose("ytter")}
            icon={AlertTriangle}
            label="Yttre"
          />
        </div>

        {del === "fastighet" ? (
          <RiskScoresView
            lockedPropertyId={lockedPropertyId}
            embedded
          />
        ) : (
          <PhysicalRisksView
            lockedPropertyId={lockedPropertyId}
            embedded
          />
        )}
      </div>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}
