"use client";

import { useQuery } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Tables, DataGapStatus } from "@/lib/supabase/database.types";

export type DataGapConfig = Tables<"data_gap_config">;

export function useDataGapConfig() {
  return useQuery({
    queryKey: queryKeys.dataGap.config,
    queryFn: async (): Promise<DataGapConfig[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("data_gap_config")
        .select("*")
        .eq("is_active", true)
        .order("is_default", { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export interface DataGapStatusSummary {
  status: DataGapStatus;
  count: number;
}

/**
 * Portfolio-level summary of data_gap_status for dashboards.
 */
export function useDataGapStatusSummary() {
  return useQuery({
    queryKey: queryKeys.dataGap.statusSummary,
    queryFn: async (): Promise<DataGapStatusSummary[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("performance_indicators")
        .select("data_gap_status");

      if (error) throw new Error(error.message);

      const counts = new Map<DataGapStatus, number>();
      for (const row of data ?? []) {
        const s = row.data_gap_status as DataGapStatus;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }

      return (["COMPLETE", "EXTRAPOLATED_WARNING", "INCOMPLETE_DATA"] as DataGapStatus[]).map(
        (status) => ({
          status,
          count: counts.get(status) ?? 0,
        })
      );
    },
  });
}

export function useIncompletePerformanceIndicators() {
  return useQuery({
    queryKey: queryKeys.performanceIndicators.byDataGapStatus("INCOMPLETE_DATA"),
    queryFn: async () => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("performance_indicators")
        .select("*")
        .eq("data_gap_status", "INCOMPLETE_DATA")
        .order("year", { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
