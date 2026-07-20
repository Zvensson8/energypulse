# Fas 9 – Simulering & renovationsscenarier

## Mål
- **Simulera** = dry-run med samma motor som apply (MEPS/CRREM/combined risk), utan att ändra status eller PI.
- **Markera klar** = apply modeled spar (befintlig `apply_completed_action`).
- **Renovationsplaner** = jämför A/B/C (billig / balanserad / aggressiv) och spara vald plan med engine-projection.

## SQL
Migrering: `supabase/migrations/20260720140000_fas9_simulate_and_scenarios.sql`

| Funktion | Syfte |
|----------|--------|
| `project_performance_with_virtual_delta` | Projicera PI-metrics med virtuell kWh-delta (inga writes) |
| `simulate_action_impact` | Dry-run en åtgärd |
| `simulate_actions_package` | Dry-run paket |
| `create_renovation_plan_from_actions` | Spara plan + projection snapshot |

Kolumner: `renovation_plans.scenario_key`, `renovation_plans.projection`.

## Server actions
- `simulateAction` / `simulateActionPackage` – `app/actions/action-application.ts`
- `generateRenovationScenarios` / `selectRenovationScenario` – `app/actions/renovation-plans.ts`

## UI
| Route | Ändring |
|-------|---------|
| `/actions` | Knapp **Simulera** → dialog med före/efter → **Markera klar och tillämpa** |
| `/renovation` | **Jämför scenarier** A/B/C |
| `/risk-scores` | CTA till renovering (jämför planer) |

## Deploy
```bash
# Supabase SQL Editor eller Management API push av 20260720140000_fas9_…
npx tsc --noEmit
```

## Noteringar
- Modeled saving ändrar fortfarande inte rå `energy_consumption`.
- Scenarier kräver öppna åtgärder med `estimated_saving_kwh` (annars warning + svag effekt).
- Äldre `generate_renovation_plan` (top-8 heuristik) finns kvar i DB men UI använder Fas 9-scenarier.
