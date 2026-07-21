/**
 * Externa datakällor – gemensamma kontrakt (SMHI, Boverket, GSI).
 * Live-API byts in bakom samma interface.
 */

export type ExternalSourceId = "smhi" | "boverket" | "gsi";

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
  /** t.ex. smhi:grid:… */
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

export type ClimateHazardResult = {
  source: "smhi";
  status: ProviderStatus;
  fetchedAt: string;
  suggestions: HazardSuggestion[];
  raw?: unknown;
  message?: string;
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
  source: "gsi";
  status: ProviderStatus;
  fetchedAt: string;
  suggestions: HazardSuggestion[];
  raw?: unknown;
  message?: string;
};

export interface ClimateHazardProvider {
  id: "smhi";
  fetchHazards(ctx: PropertyGeoContext): Promise<ClimateHazardResult>;
}

export interface BuildingNormProvider {
  id: "boverket";
  fetchNorms(ctx: PropertyGeoContext): Promise<BuildingNormResult>;
}

export interface GeoHazardProvider {
  id: "gsi";
  fetchHazards(ctx: PropertyGeoContext): Promise<GeoHazardResult>;
}

export type ExternalRefreshReport = {
  propertyId: string;
  smhi: ClimateHazardResult;
  boverket: BuildingNormResult;
  gsi: GeoHazardResult;
  appliedRiskIds: string[];
  snapshotIds: string[];
};
