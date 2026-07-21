/**
 * Externa datakällor – öppna API:er utan avtalskrav:
 * - Boverket: DVUT (öppen CSV) + klimatzon-heuristik
 * - MSB: översvämningskartering (ArcGIS REST, öppet)
 * - SGI: mark/skred via SGU öppna WMS (samordnat underlag SGI/SGU)
 *
 * Energideklarations-API (Boverket) kräver avtal och används inte här.
 * SMHI metobs (kortsiktigt väder) används inte som klimatrisk.
 */

export type ExternalSourceId = "boverket" | "msb" | "sgi";

export type ProviderStatus =
  | "disabled"
  | "stub"
  | "ok"
  | "error"
  | "missing_coords";

export type HazardKind =
  | "flood"
  | "heat"
  | "storm"
  | "subsidence"
  | "wildfire"
  | "other";

export type RiskLevel = "low" | "medium" | "high" | "very_high";

/** Föreslagen fysisk risk (mappas till physical_risks). */
export type HazardSuggestion = {
  risk_type: HazardKind;
  probability: RiskLevel;
  consequence: RiskLevel;
  summary: string;
  /** t.ex. msb:river:100y, sgi:sgu:skred-aktsamhet */
  sourceRef: string;
  confidence: "low" | "medium" | "high";
};

export type PropertyGeoContext = {
  propertyId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  municipality: string | null;
  climate_zone: string | null;
  address: string | null;
};

export type BuildingNormResult = {
  source: "boverket";
  status: ProviderStatus;
  fetchedAt: string;
  /** Föreslagen Boverket-klimatzon I–IV */
  suggestedClimateZone: "I" | "II" | "III" | "IV" | null;
  notes: string[];
  raw?: unknown;
  message?: string;
};

export type GeoHazardResult = {
  source: "msb" | "sgi";
  status: ProviderStatus;
  fetchedAt: string;
  suggestions: HazardSuggestion[];
  raw?: unknown;
  message?: string;
};

export interface BuildingNormProvider {
  id: "boverket";
  fetchNorms(ctx: PropertyGeoContext): Promise<BuildingNormResult>;
}

export interface GeoHazardProvider {
  id: "msb" | "sgi";
  fetchHazards(ctx: PropertyGeoContext): Promise<GeoHazardResult>;
}

export type ExternalRefreshReport = {
  propertyId: string;
  boverket: BuildingNormResult;
  msb: GeoHazardResult;
  sgi: GeoHazardResult;
  appliedRiskIds: string[];
  snapshotIds: string[];
};
