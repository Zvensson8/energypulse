/**
 * Prioriteringsmotor för åtgärder (Fas 5).
 *
 * priority_score = w_meps * mepsNorm + w_crrem * crremNorm + w_payback * paybackNorm
 * Defaultvikter enligt projektbeskrivning: 0.40 / 0.35 / 0.25
 */

export type PriorityWeights = {
  meps: number;
  crrem: number;
  payback: number;
};

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  meps: 0.4,
  crrem: 0.35,
  payback: 0.25,
};

/** Normalisera vikter så de summerar till 1. */
export function normalizeWeights(w: PriorityWeights): PriorityWeights {
  const sum = w.meps + w.crrem + w.payback;
  if (sum <= 0) return { ...DEFAULT_PRIORITY_WEIGHTS };
  return {
    meps: w.meps / sum,
    crrem: w.crrem / sum,
    payback: w.payback / sum,
  };
}

/**
 * MEPS-gap (kWh/m²): högre gap → högre prioritet.
 * 0 gap → 0, ≥150 kWh/m² → 1.
 */
export function normalizeMepsGap(gap: number | null | undefined): number {
  if (gap == null || Number.isNaN(gap)) return 0;
  if (gap <= 0) return 0;
  return Math.min(1, gap / 150);
}

/**
 * CRREM riskår: tidigare år → högre prioritet.
 * Nuvarande år → 1, 25+ år framåt → 0. Saknas → 0.3 (okänd risk).
 */
export function normalizeStrandingYear(
  strandingYear: number | null | undefined,
  referenceYear = new Date().getFullYear()
): number {
  if (strandingYear == null) return 0.3;
  const yearsOut = strandingYear - referenceYear;
  if (yearsOut <= 0) return 1;
  if (yearsOut >= 25) return 0;
  return 1 - yearsOut / 25;
}

/**
 * Payback: kortare återbetalningstid → högre prioritet.
 * 0 år → 1, ≥20 år → ~0.
 */
export function normalizePayback(
  paybackYears: number | null | undefined
): number {
  if (paybackYears == null || Number.isNaN(paybackYears)) return 0.4;
  if (paybackYears <= 0) return 1;
  return 1 / (1 + paybackYears / 5);
}

export function computePriorityScore(input: {
  mepsGap: number | null | undefined;
  strandingYear: number | null | undefined;
  paybackYears: number | null | undefined;
  weights?: PriorityWeights;
  referenceYear?: number;
}): {
  score: number;
  components: { meps: number; crrem: number; payback: number };
  weights: PriorityWeights;
} {
  const weights = normalizeWeights(input.weights ?? DEFAULT_PRIORITY_WEIGHTS);
  const meps = normalizeMepsGap(input.mepsGap);
  const crrem = normalizeStrandingYear(
    input.strandingYear,
    input.referenceYear
  );
  const payback = normalizePayback(input.paybackYears);
  const score =
    weights.meps * meps + weights.crrem * crrem + weights.payback * payback;
  return {
    score: Math.round(score * 10000) / 10000,
    components: { meps, crrem, payback },
    weights,
  };
}

/**
 * Uppskattad effekt av åtgärd på MEPS-gap och riskår (statisk approximation).
 * - intensity_delta_kwh_m2 ≈ saving_kwh / a_temp
 * - riskår förskjuts grovt med 1 år per ~5 kWh/m² CO2-ekv. reduktion
 *   (förenklad; speglas i UI som "uppskattning").
 */
export function estimateActionImpact(input: {
  mepsGap: number | null | undefined;
  strandingYear: number | null | undefined;
  estimatedSavingKwh: number | null | undefined;
  aTemp: number | null | undefined;
  ghgIntensity: number | null | undefined;
  totalEnergyKwh: number | null | undefined;
}): {
  intensityReduction: number | null;
  mepsGapAfter: number | null;
  strandingYearAfter: number | null;
} {
  const saving = input.estimatedSavingKwh;
  const aTemp = input.aTemp;
  if (saving == null || aTemp == null || aTemp <= 0) {
    return {
      intensityReduction: null,
      mepsGapAfter: null,
      strandingYearAfter: null,
    };
  }
  const intensityReduction = saving / aTemp;
  const mepsGapAfter =
    input.mepsGap != null ? input.mepsGap - intensityReduction : null;

  let strandingYearAfter: number | null = null;
  if (input.strandingYear != null) {
    // Rough: each 10 kWh/m² intensity cut delays stranding ~1 year
    const delayYears = Math.floor(intensityReduction / 10);
    strandingYearAfter = input.strandingYear + Math.max(0, delayYears);
  }

  return {
    intensityReduction: Math.round(intensityReduction * 10) / 10,
    mepsGapAfter:
      mepsGapAfter != null ? Math.round(mepsGapAfter * 10) / 10 : null,
    strandingYearAfter,
  };
}

export function parsePriorityWeights(raw: unknown): PriorityWeights {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PRIORITY_WEIGHTS };
  const o = raw as Record<string, unknown>;
  const meps = Number(o.meps ?? o.meps_weight ?? 0.4);
  const crrem = Number(o.crrem ?? o.crrem_weight ?? 0.35);
  const payback = Number(o.payback ?? o.payback_weight ?? 0.25);
  if ([meps, crrem, payback].some((n) => Number.isNaN(n))) {
    return { ...DEFAULT_PRIORITY_WEIGHTS };
  }
  return normalizeWeights({ meps, crrem, payback });
}
