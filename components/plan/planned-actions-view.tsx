"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hammer, ListTodo } from "lucide-react";
import { ActionsView } from "@/components/actions/actions-view";
import { RenovationPlansView } from "@/components/renovation/renovation-plans-view";
import { cn } from "@/lib/utils";

export type PlanDel = "atgarder" | "paket";

export function PlannedActionsView({
  lockedPropertyId,
  embedded = false,
  initialDel = "atgarder",
  initialBuildingId,
}: {
  lockedPropertyId?: string;
  embedded?: boolean;
  initialDel?: PlanDel;
  initialBuildingId?: string;
} = {}) {
  const router = useRouter();
  const [del, setDel] = useState<PlanDel>(initialDel);

  function choose(next: PlanDel) {
    setDel(next);
    if (embedded) return;
    const q = new URLSearchParams();
    if (next === "paket") q.set("del", "paket");
    if (initialBuildingId) q.set("building", initialBuildingId);
    const qs = q.toString();
    router.replace(qs ? `/actions?${qs}` : "/actions", { scroll: false });
  }

  return (
    <div className={embedded ? "space-y-4" : "page-shell"}>
      <div className={embedded ? "space-y-4" : "page-inner"}>
        {!embedded && (
          <div>
            <h1 className="page-title">Planerade åtgärder</h1>
            <p className="page-subtitle">
              Åtgärd = en post (kostnad, spar, status). Paket = flera åtgärder
              jämförda mot kravet 2030.
            </p>
          </div>
        )}

        <div className="flex gap-1 rounded-2xl border border-border bg-card p-1.5">
          <SegBtn
            active={del === "atgarder"}
            onClick={() => choose("atgarder")}
            icon={ListTodo}
            label="Åtgärder"
          />
          <SegBtn
            active={del === "paket"}
            onClick={() => choose("paket")}
            icon={Hammer}
            label="Paket"
          />
        </div>

        {del === "atgarder" ? (
          <ActionsView lockedPropertyId={lockedPropertyId} embedded />
        ) : (
          <RenovationPlansView
            lockedPropertyId={lockedPropertyId}
            embedded
            initialBuildingId={initialBuildingId}
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
