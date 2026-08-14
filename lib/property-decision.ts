/** User-facing property status. Engine fields stay behind this. */

export type PropertyDecisionStatus = "missing_data" | "needs_decision" | "ok";

export type PropertyPerfRow = {
  building_id: string;
  energy_intensity?: number | null;
  data_gap_status?: string | null;
  meps_2030_gap?: number | null;
  crrem_stranding_year?: number | null;
  energy_class?: string | null;
};

export type PropertyNextAction = {
  label: string;
  href?: string;
  tab?: "buildings" | "plan" | "risk";
};

export type PropertyDecision = {
  status: PropertyDecisionStatus;
  statusLabel: string;
  why: string;
  next: PropertyNextAction;
  energyIntensity: number | null;
  meets2030: boolean | null;
  climateYear: number | null;
  energyClass: string | null;
};

const STATUS_LABEL: Record<PropertyDecisionStatus, string> = {
  missing_data: "Saknar data",
  needs_decision: "Kräver beslut",
  ok: "Ok",
};

export function summarizePropertyDecision(
  buildingCount: number,
  perf: PropertyPerfRow[],
  propertyId: string,
): PropertyDecision {
  if (buildingCount === 0) {
    return {
      status: "missing_data",
      statusLabel: STATUS_LABEL.missing_data,
      why: "Inga byggnader registrerade ännu.",
      next: { label: "Lägg till byggnad", tab: "buildings" },
      energyIntensity: null,
      meets2030: null,
      climateYear: null,
      energyClass: null,
    };
  }

  if (perf.length === 0) {
    return {
      status: "missing_data",
      statusLabel: STATUS_LABEL.missing_data,
      why: "Ingen energiberäkning ännu. Importera månadsförbrukning.",
      next: { label: "Importera energi", href: `/import?property=${propertyId}` },
      energyIntensity: null,
      meets2030: null,
      climateYear: null,
      energyClass: null,
    };
  }

  const intensities = perf
    .map((p) => p.energy_intensity)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const energyIntensity =
    intensities.length > 0
      ? intensities.reduce((a, b) => a + b, 0) / intensities.length
      : null;

  const classes = perf.map((p) => p.energy_class).filter(Boolean);
  const energyClass = classes[0] ?? null;

  const incomplete = perf.some((p) => p.data_gap_status === "INCOMPLETE_DATA");
  const gaps = perf.map((p) => p.meps_2030_gap).filter((n): n is number => n != null);
  const meets2030 = gaps.length ? gaps.every((g) => g <= 0) : null;
  const years = perf
    .map((p) => p.crrem_stranding_year)
    .filter((n): n is number => n != null && n > 0);
  const climateYear = years.length ? Math.min(...years) : null;

  if (incomplete) {
    return {
      status: "missing_data",
      statusLabel: STATUS_LABEL.missing_data,
      why: "Energidata är ofullständig – komplettera innan beslut.",
      next: { label: "Importera energi", href: `/import?property=${propertyId}` },
      energyIntensity,
      meets2030,
      climateYear,
      energyClass,
    };
  }

  if (meets2030 === false) {
    return {
      status: "needs_decision",
      statusLabel: STATUS_LABEL.needs_decision,
      why: "Klarar inte energikravet 2030 med nuvarande prestanda.",
      next: { label: "Se plan", tab: "plan" },
      energyIntensity,
      meets2030,
      climateYear,
      energyClass,
    };
  }

  if (climateYear != null && climateYear < 2035) {
    return {
      status: "needs_decision",
      statusLabel: STATUS_LABEL.needs_decision,
      why: `Klimatbanan tar slut ${climateYear}.`,
      next: { label: "Se risk", tab: "risk" },
      energyIntensity,
      meets2030,
      climateYear,
      energyClass,
    };
  }

  return {
    status: "ok",
    statusLabel: STATUS_LABEL.ok,
    why: "Inget krav- eller klimattröskelbrott i senaste beräkningen.",
    next: {
      label: "Ta ut rapport",
      href: `/reports?property=${propertyId}&type=property_full`,
    },
    energyIntensity,
    meets2030,
    climateYear,
    energyClass,
  };
}
