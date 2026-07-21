# Externa datakällor: Boverket, MSB, SGI

Öppna data **utan avtalskrav**. Energideklarations-API (Boverket, kräver avtal) används **inte**.

## Syfte

| Källa | Användning | Endpoint / data |
|-------|------------|-----------------|
| **Boverket** | Klimatzon I–IV (lokal mappning) + **DVUT** närmaste ort | Öppen CSV DVUT 1991–2020 |
| **MSB** | Fysisk risk **översvämning** (vattendrag + kust) | ArcGIS REST MapServer (öppen) |
| **SGI** | **Skred-aktsamhet** (förutsättning i finkornig jordart) | SGU GeoServer WMS GetFeatureInfo (öppen) |

### Inte med

| Källa | Orsak |
|-------|--------|
| SMHI metobs | Kortsiktigt väder ≠ klimatrisk |
| Boverket energideklaration | Kräver avtal |
| Boverket klimatlaster API | Azure APIM / registrering – ej inkopplat |

## Arkitektur

```
lib/integrations/
  types.ts, config.ts, geo-utils.ts
  boverket.ts + boverket-client.ts   – DVUT + zon
  msb.ts + msb-client.ts             – flood identify
  sgi.ts + sgi-client.ts             – skred GFI (SGU)
  index.ts

app/actions/external-data.ts
  refreshPropertyExternalData / getExternalDataStatus

external_data_snapshots.source ∈ boverket | msb | sgi
(+ legacy smhi | gsi i DB)
```

## Environment

```env
# Default ON. Sätt false för att stänga av.
# EXTERNAL_DATA_BOVERKET_ENABLED=true
# EXTERNAL_DATA_MSB_ENABLED=true
# EXTERNAL_DATA_SGI_ENABLED=true
```

## Flöde

1. Fastighet har **lat/lon** (geokod).
2. **Uppdatera externa källor** på fastighetssidan.
3. Adapters körs parallellt → `external_data_snapshots`.
4. MSB/SGI kan skapa `physical_risks` om `applySuggestions=true` (default av i UI).
5. Boverket ger **underlag** (zon/DVUT), inte automatiska risker.

## Tolkning

- **MSB flod:** träff i 100/200-års- eller högsta flöde → flood-förslag.
- **MSB kust:** lägsta havsvattenstånd (m RH2000) där punkten ligger i utbredning.
- **SGI/SGU:** aktsamhetsområde = geoteknisk *förutsättning*, inte bekräftad skredrisk.
- **DVUT:** dimensionerande vintertemp för energi – inte fysisk risk.

## Deploy

```bash
npx supabase db push   # migration 20260721200000_external_sources_msb_sgi.sql
```

Smoke (nätverk):

```bash
node scripts/smoke-open-geo.mjs
```

## Licens

Ange källa i UI/snapshot: Boverket, MSB, SGU/SGI. Granska förslag innan de räknas som sanning.
