# Fas 8 – EPBD → MEPS → CRREM → CSRD/ESRS E1

## Syfte
Knyter ihop regulatorisk kedja med **kombinerad riskscore (0–100)** och **renovationsplaner**.

## Datamodell
### performance_indicators (utökad)
| Kolumn | Betydelse |
|--------|-----------|
| meps_2030_gap / meps_2033_gap | Finns sedan Fas 1 |
| meps_status | compliant / at_risk / non_compliant |
| crrem_misalignment_year | = stranding year (CSRD-terminologi) |
| combined_risk_score | 0–100 |
| financial_risk_flag | true om misalignment &lt; 2035 |

### actions (utökad)
- `estimated_meps_gap_reduction`, `estimated_misalignment_year_shift`, `estimated_ped_reduction`
- `affects_physical_risk`

### Nya tabeller
- `risk_scores` – årlig snapshot per byggnad
- `renovation_plans` + `renovation_plan_actions`

## Formel (konfigurerbar i system_config.combined_risk_weights)
```
score = 0.40·MEPS + 0.35·CRREM + 0.15·fysisk + 0.10·datakvalitet
```
- MEPS: gap 0 → 0, gap ≥150 kWh/m² → 100  
- CRREM: misalignment nu → 100, ≥25 år → 0  
- Fysisk: snitt physical_risks (open/monitoring) / 16  
- Data: 100 − completeness (INCOMPLETE höjer)

## SQL
Migrering: `20260720120000_fas8_epbd_risk_csrd.sql`

| Funktion | Syfte |
|----------|--------|
| `calculate_combined_risk_score` | Beräkna + UPSERT risk_scores + PI |
| `recalculate_after_action` | Completed action → omräkning + risk |
| `generate_renovation_plan` | Draft-plan från prioriterade actions |
| `refresh_all_risk_scores` | Portföljbatch |

## UI
| Route | |
|-------|--|
| `/risk-scores` | Portfölj risk + generera plan |
| `/renovation` | Planer, statusflöde |
| Dashboard | Snitt risk + financial risk-alerts |

## Deploy
```bash
# SQL Editor eller:
npx supabase db push
# sedan i app:
# Riskscore → Räkna om portfölj
```
