# Fas 10 – Förvaltarens beslutsslinga

## Flöde
1. **Se betyg** – `/risk-scores` → klick hus → `/buildings/[id]`
2. **Simulera** – på scorecard eller `/actions`
3. **Jämför planer** – `/renovation?building=…` (A/B/C)
4. **Exportera** – Besluts-PDF från scorecard

## Nytt
- `getBuildingScorecard` + `BuildingScorecardView`
- `exportBuildingDecisionPdf`
- Deep-links med `building_id`

## CSRD
Formell ESRS E1-export är **inte** i MVP (Fas 10b).
