/** User-facing property status. Engine fields stay behind this. */

export type PropertyDecisionStatus =
  | "unlinked"
  | "missing_data"
  | "needs_decision"
  | "ok";

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
  verb?: "link" | "import" | "do" | "pdf";
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
  unlinked: "Ej kopplad",
  missing_data: "Saknar data",
  needs_decision: "Kräver beslut",
  ok: "Ok",
};

export function summarizePropertyDecision(
  buildingCount: number,
  perf: PropertyPerfRow[],
  propertyId: string,
  opts?: { linked?: boolean; highRiskWhy?: string | null },
): PropertyDecision {
  const linked = opts?.linked !== false;
  const highRiskWhy = opts?.highRiskWhy ?? null;

  if (!linked) {
    return {
      status: "unlinked",
      statusLabel: STATUS_LABEL.unlinked,
      why: "Inte kopplad till Liljeblads. Ingen arbetsorder kan skapas.",
      next: { label: "Koppla", href: `/properties/${propertyId}`, verb: "link" },
      energyIntensity: null,
      meets2030: null,
      climateYear: null,
      energyClass: null,
    };
  }

  if (buildingCount === 0) {
    return {
      status: "missing_data",
      statusLabel: STATUS_LABEL.missing_data,
      why: "Ingen energiberäkning. Importera månadsförbrukning.",
      next: {
        label: "Importera",
        href: `/import?property=${propertyId}`,
        verb: "import",
      },
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
      why: "Ingen energiberäkning. Importera månadsförbrukning.",
      next: {
        label: "Importera",
        href: `/import?property=${propertyId}`,
        verb: "import",
      },
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
  const gaps = perf
    .map((p) => p.meps_2030_gap)
    .filter((n): n is number => n != null);
  const meets2030 = gaps.length ? gaps.every((g) => g <= 0) : null;
  const years = perf
    .map((p) => p.crrem_stranding_year)
    .filter((n): n is number => n != null && n > 0);
  const climateYear = years.length ? Math.min(...years) : null;
  const worstGap =
    gaps.length > 0 ? Math.max(...gaps.filter((g) => g > 0), 0) : null;

  if (incomplete) {
    return {
      status: "missing_data",
      statusLabel: STATUS_LABEL.missing_data,
      why: "Energidata är ofullständig – komplettera innan beslut.",
      next: {
        label: "Importera",
        href: `/import?property=${propertyId}`,
        verb: "import",
      },
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
      why:
        worstGap != null && worstGap > 0
          ? `Klarar inte 2030 · gap ${Math.round(worstGap)} kWh/m²`
          : "Klarar inte energikravet 2030.",
      next: { label: "Gör", tab: "plan", verb: "do" },
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
      why: `Klimatriskår ${climateYear}.`,
      next: { label: "Gör", tab: "plan", verb: "do" },
      energyIntensity,
      meets2030,
      climateYear,
      energyClass,
    };
  }

  if (highRiskWhy) {
    return {
      status: "needs_decision",
      statusLabel: STATUS_LABEL.needs_decision,
      why: highRiskWhy,
      next: { label: "Gör", tab: "plan", verb: "do" },
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
      label: "PDF",
      href: `/reports?property=${propertyId}&type=budget`,
      verb: "pdf",
    },
    energyIntensity,
    meets2030,
    climateYear,
    energyClass,
  };
}
