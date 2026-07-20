# EnergyPulse v2.0

Single Source of Truth för energiprestanda, MEPS-efterlevnad och CRREM-strandingrisk.

## Fasstatus

| Fas | Status | Innehåll |
|-----|--------|----------|
| **1** | Klart | PostgreSQL-schema, RLS, beräkningsfunktioner, seed |
| **2** | Klart | Next.js 15 backend, Ingestion Engine, Zod, React Query hooks |
| **3** | Klart | Dashboard + buildings-tabell (terminal UI, cmd+k, Excel) |
| **4** | Klart | Formel-tooltips, provenance, CRREM-vy, override-UI, audit trail |
| **6** | Klart | Playwright e2e, perf, security, monitoring, CI/CD, driftmanual |

## Snabbstart

```bash
cd energypulse
cp .env.example .env.local
# Fyll i NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

npm install

# Kör SQL i Supabase SQL Editor (i ordning):
# 1. supabase/migrations/20260719_energypulse_v2_fas1.sql
# 2. supabase/migrations/20260719_energypulse_v2_fas2.sql

npm run dev
```

## Fas 2 – Backendstruktur

```
app/actions/
  ingestion.ts          # Modular Ingestion Engine (preview/commit/retry)
  override.ts           # INCOMPLETE_DATA override + audit
  performance.ts        # calculate_yearly_performance wrappers
  spaces.ts             # GDPR: spaces_safe + decrypt
  actions-crud.ts       # Åtgärdsregister

lib/
  validations/          # Zod-scheman (speglar DB)
  ingestion/            # parse → map → validate → upsert → dead-letter
  supabase/             # typed server/client + database.types.ts
  hooks/                # React Query (performance, actions, data_gap, spaces)
  logger.ts             # structured JSON logging
  auth/session.ts       # role gates

docs/FAS2_USAGE.md      # Anropsexempel
```

## Ingestion Engine

```ts
import {
  previewEnergyConsumptionImport,
  commitEnergyConsumptionImport,
} from "@/app/actions/ingestion";

// 1. Preview (dry-run)
const preview = await previewEnergyConsumptionImport({
  fileBase64: btoa(csv),
  fileName: "energi.csv",
});

// 2. Commit → upsert + dead letters + calculate_yearly_performance
const commit = await commitEnergyConsumptionImport({
  fileBase64: btoa(csv),
  fileName: "energi.csv",
  columnMapping: preview.data?.appliedMapping,
  acceptWarnings: true,
  recalculatePerformance: true,
});
```

### Affärsregler (hårda)

| Regel | Resultat |
|-------|----------|
| `consumption_kwh < 0` | Reject → dead-letter |
| YoY-avvikelse > 30 % | Warning + quality_class nedgraderas |
| Area täcker inte månad | Reject → dead-letter |
| Saknade månader vs `data_gap_config` | Notes; status sätts i `calculate_yearly_performance` |

## After-import performance

```ts
import { recalculateYearlyPerformance } from "@/app/actions/performance";

await recalculateYearlyPerformance({
  building_id: "...",
  year: 2024,
});
// → UPSERT performance_indicators inkl. data_gap_status
```

Se även `docs/FAS2_USAGE.md`.

## GDPR

- Alla space-listningar: `spaces_safe` (maskerad `tenant_name`)
- Dekryptering: `decryptTenantName({ space_id, reason })` → audit `DECRYPT`
- `viewer` blockeras

## Typegen

Handskrivna typer i `lib/supabase/database.types.ts` speglar Fas 1+2.
När DB är live:

```bash
npm run gen:types
```

## Fas 3 – UI (Bloomberg × Linear)

```
/dashboard   KPI-kort, risk heatmap, data gap-diagram, top stranded/MEPS
/buildings   Virtuell tabell, filter, formel-tooltips, provenance, Excel
⌘K           Global sök (fastighet / byggnad / åtgärd)
```

- Tailwind + shadcn-stil + Lucide
- TanStack Table + Virtual, column pinning (Byggnad/Fastighet)
- Recharts (MEPS-bar + gap pie)
- react-resizable-panels
- Server-side pagination/sort/filter via `queryBuildingPerformance`
- Excel via `exportBuildingPerformanceExcel` (xlsx)

### Design
Extrem datadensitet: `text-table` (0.72rem), radhöjd 26px, mörk terminal-palett, A–G-färger, data_gap badges med ⚠ för INCOMPLETE_DATA.

## Pilot-seed + fastighets-CRUD

```bash
npm run seed:pilot    # 3 fastigheter, 6 byggnader, 36 mån, calc + override-rapport
```

| UI | Flöde |
|----|--------|
| `/properties` | Lista / sök fastigheter |
| `/properties/new` | Skapa (namn, beteckning, kommun, klimatzon…) |
| `/properties/[id]` | Detalj, byggnader, risker, beräkna om |
| `/properties/[id]/edit` | Redigera & spara |

Se `docs/PILOT_SEED.md`.

## Fas 6 – QA / DevOps

```bash
# E2E (kräver .env.local + E2E_ADMIN_*)
npm run test:e2e

# Prestanda
npm run perf:import      # 12 mån < 60s
npm run perf:dashboard   # queries < 3s
# npm run perf:seed      # ~180×8 år (tungt)

# Security SQL
# Kör supabase/tests/security_audit.sql i SQL Editor
```

| Doc | Innehåll |
|-----|----------|
| `docs/OPERATIONS.md` | Deploy, backup, retention, monitoring |
| `docs/SECURITY_AUDIT.md` | RLS, GDPR, Vault |
| `docs/FAS6_QA.md` | Go-live checklista |
| `.github/workflows/ci.yml` | Typecheck, migrations, e2e |
| `.github/workflows/deploy.yml` | db push + Vercel |

## Tech stack

- Next.js 15 App Router + TypeScript
- Supabase SSR (`@supabase/ssr`)
- Zod + React Hook Form
- Server Actions för mutationer + queries
- TanStack Query + Table + Virtual
- Tailwind, Recharts, cmdk, papaparse, xlsx
- Playwright, GitHub Actions, Vercel
