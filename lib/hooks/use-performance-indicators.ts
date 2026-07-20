"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Tables, DataGapStatus } from "@/lib/supabase/database.types";
import {
  recalculateYearlyPerformance,
} from "@/app/actions/performance";
import { overrideIncompletePerformance } from "@/app/actions/override";

export type PerformanceIndicator = Tables<"performance_indicators">;

export function usePerformanceIndicators(buildingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.performanceIndicators.byBuilding(buildingId ?? ""),
    enabled: Boolean(buildingId),
    queryFn: async (): Promise<PerformanceIndicator[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("performance_indicators")
        .select("*")
        .eq("building_id", buildingId!)
        .order("year", { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function usePerformanceIndicator(
  buildingId: string | undefined,
  year: number | undefined
) {
  return useQuery({
    queryKey: queryKeys.performanceIndicators.byBuildingYear(
      buildingId ?? "",
      year ?? 0
    ),
    enabled: Boolean(buildingId && year),
    queryFn: async (): Promise<PerformanceIndicator | null> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("performance_indicators")
        .select("*")
        .eq("building_id", buildingId!)
        .eq("year", year!)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** Filter buildings by data_gap_status for dashboard risk views. */
export function usePerformanceByDataGapStatus(status: DataGapStatus | undefined) {
  return useQuery({
    queryKey: queryKeys.performanceIndicators.byDataGapStatus(status ?? ""),
    enabled: Boolean(status),
    queryFn: async (): Promise<PerformanceIndicator[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("performance_indicators")
        .select("*")
        .eq("data_gap_status", status!)
        .order("year", { ascending: false })
        .limit(500);

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useRecalculatePerformance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { building_id: string; year: number }) => {
      const result = await recalculateYearlyPerformance(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.performanceIndicators.byBuilding(data.building_id),
      });
      void qc.invalidateQueries({
        queryKey: queryKeys.dataGap.statusSummary,
      });
    },
  });
}

export function useOverrideIncompletePerformance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      building_id: string;
      year: number;
      override_reason: string;
    }) => {
      const result = await overrideIncompletePerformance(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.performanceIndicators.byBuilding(data.building_id),
      });
    },
  });
}
