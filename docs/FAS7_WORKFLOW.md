# Fas 7 – Action & Risk Workflow Engine

## Översikt
Gör EnergyPulse till aktivt beslutsstöd:

1. **Action application** – `status → completed` tillämpar modeled spar, räknar om PI, sparar före/efter.
2. **Improvement detection** – föreslår "Ny energideklaration" vid hög intensitet + positiv trend.
3. **Risk workflow** – open / monitoring / resolved / dismissed med motivering + audit.
4. **Mitigation plans** – generera och acceptera åtgärdsplaner per byggnad.
5. **Data edit** – kontrollerad redigering av consumption/area med rollback.

## SQL
Migrering: `supabase/migrations/20260720100000_fas7_workflow_engine.sql`

Viktiga funktioner:
- `apply_completed_action` / `revert_action_application`
- `recalculate_performance_with_adjustments`
- `refresh_compliance_risks` / `set_*_risk_status`
- `detect_improvement_candidates` / `suggest_declaration_actions`
- `generate_mitigation_plan` / `accept_mitigation_plan`
- `apply_energy_consumption_edit` / `apply_area_edit` / `rollback_data_edit`

## UI
| Route | Funktion |
|-------|----------|
| `/actions` | Klar, före/efter, plan, förbättringsanalys |
| `/risks` | Fysiska + MEPS/CRREM, statusflöde |
| `/data-edit` | Manuell redigering (admin/PM) |
| `/dashboard` | Alert-chips för öppna risker & deklarationsförslag |

## Deploy
```bash
npx supabase db push   # eller SQL Editor
npm run gen:types      # valfritt efter push
```

## Noteringar
- Modeled saving ändrar **inte** rå `energy_consumption`.
- Dismissed/resolved compliance-risker skapas inte om på nytt av refresh.
- Data-edit endast `admin` + `portfolio_manager`.
