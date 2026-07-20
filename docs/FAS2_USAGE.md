# EnergyPulse v2.0 – Fas 2 Usage (Backend)

## After import: recalculate performance

`commitEnergyConsumptionImport` already calls `calculate_yearly_performance` for each
affected `(building_id, year)`. You can also call it explicitly:

```ts
import { recalculateYearlyPerformance } from "@/app/actions/performance";
import { commitEnergyConsumptionImport } from "@/app/actions/ingestion";

// 1) Import
const commit = await commitEnergyConsumptionImport({
  fileBase64: Buffer.from(csv, "utf-8").toString("base64"),
  fileName: "energi_2024.csv",
  columnMapping: {
    Byggnad: "building_name",
    Energikälla: "energy_source_name",
    År: "year",
    Månad: "month",
    kWh: "consumption_kwh",
  },
  acceptWarnings: true,
  recalculatePerformance: true, // default true
});

if (commit.success) {
  console.log(commit.data.performanceRecalculated);
  // [{ building_id, year, data_gap_status, data_completeness_percent }, ...]
}

// 2) Manual recalculate (e.g. after area change)
const perf = await recalculateYearlyPerformance({
  building_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  year: 2024,
});

// 3) Override INCOMPLETE_DATA (admin / portfolio_manager only)
import { overrideIncompletePerformance } from "@/app/actions/override";

const overridden = await overrideIncompletePerformance({
  building_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  year: 2023,
  override_reason: "Godkänt av portföljchef för Q1-rapport",
});
```

## Ingestion pipeline stages

```
fileBase64 → parse (CSV/xlsx)
          → column mapping (auto + override)
          → Zod + business rules
               • negative kWh → error / dead-letter
               • YoY |Δ| > 30% → warning, quality_class downgrade
               • area.valid_from/to must cover month
               • data_gap_config thresholds → notes
          → preview (dry-run) OR
            batch upsert + dead_letters + calculate_yearly_performance
```

## GDPR

```ts
import { listSpacesSafe, decryptTenantName } from "@/app/actions/spaces";

// Always masked
const spaces = await listSpacesSafe(buildingId);

// Explicit reveal + audit
const plain = await decryptTenantName({
  space_id: spaceId,
  reason: "Hyresgästkontakt i ärende #123",
});
```

## React Query (Fas 3)

```tsx
"use client";
import { QueryProvider } from "@/lib/providers/query-provider";
import {
  usePerformanceIndicators,
  useActions,
  useDataGapStatusSummary,
  useSpacesSafe,
  useCommitEnergyImport,
} from "@/lib/hooks";
```

## Migrations order

1. `20260719_energypulse_v2_fas1.sql`
2. `20260719_energypulse_v2_fas2.sql`
