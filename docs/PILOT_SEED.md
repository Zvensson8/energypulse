# Pilot-seed – 3 realistiska fastigheter

## Innehåll

| Entitet | Antal | Detalj |
|---------|------:|--------|
| Portfolio | 1 | EnergyPulse Pilotportfölj |
| Properties | 3 | Stockholm (III), Göteborg (II), Malmö (I) |
| Buildings | 6 | Olika byggår, kontor/lager/retail, en K-märkt |
| Areas | 8 | Atemp-versioner (bl.a. före/efter renovering) |
| Energy | 36 mån | 2023–2025 med medvetna data-gap |
| Actions | 4–5 | Isolering, VVX, LED, solceller |
| Physical risks | 6 | Värme, översvämning, storm |

### Data-gap-design

| Byggnad | År | Saknade mån | Förväntad status |
|---------|-----|-------------|------------------|
| Hus A Kontor | 2024 | 2 (nov–dec) | EXTRAPOLATED_WARNING |
| Hus B K-märkt | 2025 | 4 (sep–dec) | INCOMPLETE_DATA |
| Kontorsflygel | 2023 | 1 (juli) | EXTRAPOLATED_WARNING |
| Butikshus | 2025 | 3 (okt–dec) | EXTRAPOLATED_WARNING |
| Övriga | – | 0 | COMPLETE |

## Körning

### Alternativ A – Node (rekommenderas)

```bash
cd energypulse
# .env.local med URL + SERVICE_ROLE
npm run seed:pilot
```

Scriptet:
1. Applicerar seed (SQL API om token finns, annars JS)
2. Kör `calculate_yearly_performance` för alla byggnader × 2023–2025
3. Kör **override-exempel** på Hus B 2025
4. Skriver tabell med `data_gap_status` och completeness
5. Skapar demo-roller om `ADMIN_EMAIL`/`E2E_ADMIN_EMAIL` finns

### Alternativ B – SQL Editor

1. Kör `supabase/seed/pilot_fastigheter.sql`
2. Kör `npm run seed:pilot` (calc-delen) **eller** manuellt:

```sql
SELECT * FROM calculate_yearly_performance('c1000001-0001-4001-8001-000000000001', 2024);
-- … upprepa per building/år

-- Override Hus B 2025:
SELECT * FROM calculate_yearly_performance(
  'c1000002-0002-4002-8002-000000000002', 2025,
  true,
  'Pilot: godkänt av portföljchef – saknade höstmånader ej materiala'
);
```

## Efter seed – UI-flöden

| Flöde | Väg |
|-------|-----|
| KPI + heatmap | `/dashboard` |
| Prestandatabell + provenance | `/buildings` |
| Fastighetsregister | `/properties` |
| Ny fastighet | `/properties/new` |
| Redigera / lägg byggnad | `/properties/[id]` |
| CRREM | `/crrem` |
| Override | Rad med INCOMPLETE → sköld-ikon |

## Demo-användare (efter seed:pilot med admin)

| E-post | Lösenord | Roll |
|--------|----------|------|
| befintlig admin | (din) | admin |
| pilot.forvaltare@example.com | PilotDemo123! | property_manager (endast Stockholm) |
| pilot.lasare@example.com | PilotDemo123! | viewer |

## Fasta UUID (för tester)

- Portfolio: `a1111111-1111-4111-8111-111111111111`
- Stockholm: `b1000001-0001-4001-8001-000000000001`
- Hus A: `c1000001-0001-4001-8001-000000000001`
- Hus B: `c1000002-0002-4002-8002-000000000002`
