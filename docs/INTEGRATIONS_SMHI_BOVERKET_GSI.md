# Externa datakällor: SMHI, Boverket, GSI

## Syfte i EnergyPulse

| Källa | Användning |
|-------|------------|
| **SMHI** | Klimat/väder → föreslå **fysiska risker** (värme, nederbörd/översvämning, storm) utifrån lat/lon |
| **Boverket** | **Klimatzon** I–IV, regelkontext MEPS/EPBD; ev. jämförelse med energideklaration |
| **GSI** | Geodata för **mark/skred/sättning** (i koden: geohazard-provider; verifiera om ni menar SGI/SGU/leverantör) |

Dessa ersätter **inte** energimätning, CRREM-motor eller manuell riskbedömning. De ger **underlag och förslag** med tydlig källa.

## Arkitektur

```
lib/integrations/
  types.ts          – gemensamma DTO + provider-interfaces
  config.ts         – env-flaggor
  smhi.ts           – ClimateHazardProvider (stub → live)
  boverket.ts       – BuildingNormProvider (stub → live)
  gsi.ts            – GeoHazardProvider (stub → live)
  index.ts          – orchestrate refresh

app/actions/external-data.ts
  refreshPropertyExternalData(propertyId)
  getExternalDataStatus(propertyId)

Tabell: external_data_snapshots
  source, property_id, status, payload, error, fetched_at
```

## Environment

```env
# Feature flags (default: av)
EXTERNAL_DATA_SMHI_ENABLED=false
EXTERNAL_DATA_BOVERKET_ENABLED=false
EXTERNAL_DATA_GSI_ENABLED=false

# Framtida nycklar (används inte i stub-läge)
# SMHI_API_KEY=
# BOVERKET_API_KEY=
# GSI_API_URL=
# GSI_API_KEY=
```

## Flöde

1. Fastighet har **lat/lon** (geokod).
2. Användare klickar **Uppdatera externa källor** (eller schemalagd jobb senare).
3. Varje **enabled** adapter anropas med koordinater + kommun.
4. Svar normaliseras → sparas i `external_data_snapshots`.
5. Riskförslag kan skapas som `physical_risks` med `source = smhi:…` / `gsi:…` (endast om `applySuggestions=true`).
6. Boverket-stub kan föreslå klimatzon (appliceras inte automatiskt utan granskning i MVP).

## Stub vs live

| Läge | Beteende |
|------|----------|
| Flagga `false` | Adapter returnerar `status: disabled` |
| Flagga `true` utan API | Stub returnerar `status: stub` + tomma förslag (eller fixture) |
| Flagga `true` + API | Live fetch, spara payload, mappa till risker |

## Roadmap

1. **Nu:** stubs + snapshots + UI  
2. **SMHI live** – öppna data, värme/nederbörd-indikatorer  
3. **Boverket** – zon-validering / öppna dataset  
4. **GSI** – när endpoint och licens är klara  

## Licens & kvalitet

- Kontrollera öppna data-villkor per källa.
- Visa alltid **källa + tidpunkt** i UI.
- Förslag ska granskas av förvaltare innan de räknas som “sanning”.
