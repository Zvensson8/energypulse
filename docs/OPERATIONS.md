# EnergyPulse v2.0 – Driftmanual (Fas 6)

## Stack

| Lager | Tjänst |
|-------|--------|
| Frontend | Vercel (Next.js 15) |
| Backend/DB | Supabase (Postgres, Auth, RLS, Vault, Edge Functions) |
| CI/CD | GitHub Actions |
| Region | Vercel `arn1` (Stockholm) · Supabase West EU (Paris) för aktuellt projekt |

## Miljövariabler

### Vercel (Production)

| Variabel | Synlighet |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only – **aldrig** `NEXT_PUBLIC_` |
| `LOG_LEVEL` | `info` |

### GitHub Actions secrets / vars

| Namn | Typ |
|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Variable |
| `SUPABASE_PROJECT_REF` | Variable (t.ex. `jbnttxywunvvvivdfzeh`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret |
| `SUPABASE_ACCESS_TOKEN` | Secret (CLI migrations) |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Secret |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Secret |

## Deploy-rutin

1. PR → CI: typecheck, build, migration filename check, e2e (om secrets finns)
2. Merge till `main` → `deploy.yml`: `supabase db push` → Vercel production
3. Verifiera:
   - `/login` fungerar
   - `/dashboard` laddar KPI
   - SQL: `select public.snapshot_ops_metrics();`

### Manuell migrering

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
npx supabase link --project-ref jbnttxywunvvvivdfzeh
npx supabase db push
```

### Manuell Vercel

```bash
vercel --prod
```

## Backup-strategi (sektion 13.2)

| Lager | Metod | Retention |
|-------|--------|-----------|
| Point-in-time recovery | Supabase Pro PITR | Enligt plan (typiskt 7–14 dagar) |
| Logiska backups | Dashboard → Database → Backups | Daily automatic |
| Export | Schemalagd `pg_dump` till object storage (S3-kompatibelt) | 30–90 dagar |
| Disaster recovery | Database branching / restore från backup | Testas kvartalsvis |

### Rekommenderad export (cron / GitHub scheduled)

```bash
# Exempel – kör på runner med DB URL (pooler session mode)
pg_dump "$DATABASE_URL" -Fc -f "energypulse-$(date +%F).dump"
# Ladda upp till S3 / Supabase Storage bucket "backups"
```

## Data retention (GDPR / 13.2)

Konfigureras i `system_config.key = 'data_retention_years'`:

| Data | Default | Motivering |
|------|---------|------------|
| `energy_consumption` | 7 år | Bokföring / energideklaration |
| `performance_indicators` | 10+ år | Trend / stranding-historik |
| tenant PII | Minimal | Rätt till radering; ciphertext + maskering |

### Preview innan delete

```sql
SELECT public.retention_preview();
```

### Manuell purge (exempel – kör ALDRIG utan backup)

```sql
-- Dry-run counts first via retention_preview()
-- DELETE FROM energy_consumption
-- WHERE make_date(year, month, 1) < current_date - interval '7 years';
```

## Monitoring

### Metrics

Tabell `ops_metrics` + funktioner:

| Metric | Källa |
|--------|--------|
| `data_freshness_days` | `snapshot_ops_metrics()` |
| `import_dead_letters_7d` | dead-letter queue |
| `override_count_7d` | `data_quality_logs` |
| `incomplete_pi_count` | `performance_indicators` |
| `calc_latency_ms` | Edge `metrics-snapshot` |
| `import_failure_rate_7d` | dead / (dead + batches) |

### Alerts

| Alert | Trigger | Kanal |
|-------|---------|--------|
| Data freshness | `list_stale_buildings(45)` > 0 | Edge `data-freshness-alert` → webhook |
| Import failures | `import_failure_rate_7d` > 0.1 | Webhook / dashboard |
| Override spike | `override_count_7d` > tröskel | Manuell granskning |
| Calc latency | `calc_latency_ms` > 5000 | Webhook |

### Schedules

Se `supabase/functions/README.md`.

## Prestanda

Mål (spec):

| Scenario | Budget |
|----------|--------|
| Dashboard (realistisk volym) | < 3 s |
| Import 12 månader + calc | < 60 s |

### Kör benchmarks

```bash
# Efter seed (valfritt, tungt):
node --env-file=.env.local scripts/perf/seed-portfolio.mjs   # ~180 × 8 år

node --env-file=.env.local scripts/perf/bench-dashboard.mjs  # expect PASS < 3000ms
node --env-file=.env.local scripts/perf/bench-import.mjs     # expect PASS < 60000ms
```

### Optimering om budget spricker

1. Index redan på `(building_id, year)` – verifiera `EXPLAIN`
2. Materialiserad vy för portfolio-KPI
3. Partitionera `energy_consumption` per year (se Fas 1-kommentarer)
4. Server-side aggregation RPC istället för full PI-fetch

## E2E

```bash
# Kräver .env.local + admin-konto
export E2E_ADMIN_EMAIL=...
export E2E_ADMIN_PASSWORD=...
npm run test:e2e
```

Tester:

| Fil | Täcker |
|-----|--------|
| `data-gap.spec.ts` | 0 / 2 / 4 saknade månader |
| `override-audit.spec.ts` | Override + audit-logg |
| `import-calculate-dashboard.spec.ts` | Import→calc→UI |
| `rls-property-manager.spec.ts` | RLS scope + maskering |
| `security-tenant.spec.ts` | Decrypt audit / no leak |

## Incident runbook (kort)

1. **Dashboard tom** – kolla Auth, RLS, `user_profiles.role`
2. **Fel intensiteter** – provenance-modal + `data_gap_status`
3. **Import-fel** – `ingestion_dead_letters`, retry Server Action
4. **Misstänkt PII-läcka** – granska `DECRYPT` i `data_quality_logs`, rotera Vault-nyckel
5. **DB-outage** – Supabase status + restore från PITR

## Kontakt / ägarskap

- Applikation: EnergyPulse-teamet  
- Supabase project ref: se Vercel / GitHub vars  
- Rotera secrets kvartalsvis (service_role, access tokens, Vault key)
