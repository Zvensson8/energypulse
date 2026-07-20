/**
 * EnergyPulse v2.0 – handskrivna Supabase Database-typer (speglar Fas 1-migrering).
 *
 * Regenerera med:
 *   npm run gen:types
 * när databasen ändras. Denna fil är source-of-truth tills gen:types körs.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "portfolio_manager" | "property_manager" | "viewer";
export type SpaceType =
  | "office"
  | "retail"
  | "warehouse"
  | "industrial"
  | "hotel"
  | "education"
  | "healthcare"
  | "mixed"
  | "other";
export type QualityClass = "A" | "B" | "C" | "D";
export type EnergyClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type DataGapStatus = "COMPLETE" | "EXTRAPOLATED_WARNING" | "INCOMPLETE_DATA";
export type OwnershipType = "owned" | "leased" | "joint_venture" | "other";
export type PropertyStatus = "active" | "disposed" | "under_development" | "inactive";
export type EnergySourceType =
  | "electricity"
  | "district_heating"
  | "district_cooling"
  | "natural_gas"
  | "oil"
  | "biofuel"
  | "other";
export type EmissionScope = "scope1" | "scope2" | "scope3";
export type ActionStatus =
  | "proposed"
  | "approved"
  | "in_progress"
  | "completed"
  | "cancelled";
export type ActionCategory =
  | "envelope"
  | "hvac"
  | "lighting"
  | "controls"
  | "renewable"
  | "behaviour"
  | "other";
export type RiskType =
  | "flood"
  | "heat"
  | "storm"
  | "subsidence"
  | "wildfire"
  | "other";
export type ProbabilityLevel = "low" | "medium" | "high" | "very_high";
export type ConsequenceLevel = "low" | "medium" | "high" | "very_high";
export type RiskWorkflowStatus =
  | "open"
  | "monitoring"
  | "resolved"
  | "dismissed";

export interface Database {
  public: {
    Tables: {
      portfolios: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          base_currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          portfolio_id: string;
          external_id: string | null;
          name: string;
          address: string | null;
          municipality: string | null;
          climate_zone: string | null;
          latitude: number | null;
          longitude: number | null;
          ownership_type: OwnershipType;
          status: PropertyStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          external_id?: string | null;
          name: string;
          address?: string | null;
          municipality?: string | null;
          climate_zone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          ownership_type?: OwnershipType;
          status?: PropertyStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "properties_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
        ];
      };
      buildings: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          construction_year: number | null;
          major_renovation_year: number | null;
          construction_type: string | null;
          facade_share: number | null;
          roof_share: number | null;
          window_share: number | null;
          protected_status: boolean;
          primary_use: SpaceType | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          name: string;
          construction_year?: number | null;
          major_renovation_year?: number | null;
          construction_type?: string | null;
          facade_share?: number | null;
          roof_share?: number | null;
          window_share?: number | null;
          protected_status?: boolean;
          primary_use?: SpaceType | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "buildings_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      spaces: {
        Row: {
          id: string;
          building_id: string;
          name: string | null;
          space_type: SpaceType;
          tenant_name_encrypted: string | null;
          contract_start: string | null;
          contract_end: string | null;
          loa: number | null;
          boa: number | null;
          is_heated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          name?: string | null;
          space_type?: SpaceType;
          tenant_name_encrypted?: string | null;
          contract_start?: string | null;
          contract_end?: string | null;
          loa?: number | null;
          boa?: number | null;
          is_heated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "spaces_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      areas: {
        Row: {
          id: string;
          building_id: string;
          valid_from: string;
          valid_to: string | null;
          bta: number | null;
          a_temp: number;
          loa_total: number | null;
          source: string | null;
          quality_class: QualityClass;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          valid_from: string;
          valid_to?: string | null;
          bta?: number | null;
          a_temp: number;
          loa_total?: number | null;
          source?: string | null;
          quality_class?: QualityClass;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "areas_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      energy_sources: {
        Row: {
          id: string;
          name: string;
          source_type: EnergySourceType;
          is_renewable: boolean;
          scope: EmissionScope;
          primary_energy_factor: number;
          emission_factor_kg_co2e_per_kwh: number;
          valid_from: string;
          valid_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          source_type: EnergySourceType;
          is_renewable?: boolean;
          scope?: EmissionScope;
          primary_energy_factor: number;
          emission_factor_kg_co2e_per_kwh: number;
          valid_from?: string;
          valid_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      crrem_pathways: {
        Row: {
          id: string;
          crrem_version: string;
          property_type: string;
          country_code: string;
          target_year: number;
          intensity_target_ghg: number;
          intensity_target_energy: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          crrem_version: string;
          property_type?: string;
          country_code?: string;
          target_year: number;
          intensity_target_ghg: number;
          intensity_target_energy?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      energy_consumption: {
        Row: {
          id: string;
          building_id: string;
          space_id: string | null;
          energy_source_id: string;
          year: number;
          month: number;
          consumption_kwh: number;
          is_weather_corrected: boolean;
          is_estimated: boolean;
          quality_class: QualityClass;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          space_id?: string | null;
          energy_source_id: string;
          year: number;
          month: number;
          consumption_kwh: number;
          is_weather_corrected?: boolean;
          is_estimated?: boolean;
          quality_class?: QualityClass;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "energy_consumption_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "energy_consumption_energy_source_id_fkey";
            columns: ["energy_source_id"];
            isOneToOne: false;
            referencedRelation: "energy_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "energy_consumption_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_indicators: {
        Row: {
          id: string;
          building_id: string;
          year: number;
          area_id: string | null;
          a_temp: number | null;
          total_energy_kwh: number | null;
          energy_intensity: number | null;
          primary_energy_intensity: number | null;
          energy_class: EnergyClass | null;
          ghg_intensity: number | null;
          scope1_kg_co2e: number | null;
          scope2_kg_co2e: number | null;
          scope3_kg_co2e: number | null;
          crrem_stranding_year: number | null;
          meps_2030_gap: number | null;
          meps_2033_gap: number | null;
          meps_status: string | null;
          crrem_misalignment_year: number | null;
          combined_risk_score: number | null;
          financial_risk_flag: boolean;
          calculation_method: string;
          crrem_version_used: string | null;
          data_gap_status: DataGapStatus;
          data_completeness_percent: number;
          override_applied: boolean;
          override_reason: string | null;
          calculated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          year: number;
          area_id?: string | null;
          a_temp?: number | null;
          total_energy_kwh?: number | null;
          energy_intensity?: number | null;
          primary_energy_intensity?: number | null;
          energy_class?: EnergyClass | null;
          ghg_intensity?: number | null;
          scope1_kg_co2e?: number | null;
          scope2_kg_co2e?: number | null;
          scope3_kg_co2e?: number | null;
          crrem_stranding_year?: number | null;
          meps_2030_gap?: number | null;
          meps_2033_gap?: number | null;
          calculation_method?: string;
          crrem_version_used?: string | null;
          data_gap_status?: DataGapStatus;
          data_completeness_percent?: number;
          override_applied?: boolean;
          override_reason?: string | null;
          calculated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "performance_indicators_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_indicators_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      actions: {
        Row: {
          id: string;
          building_id: string;
          title: string;
          category: ActionCategory;
          description: string | null;
          estimated_saving_kwh: number | null;
          estimated_saving_co2: number | null;
          investment_cost: number | null;
          currency: string;
          payback_years: number | null;
          status: ActionStatus;
          priority_score: number | null;
          planned_year: number | null;
          completed_date: string | null;
          source: string;
          estimated_meps_gap_reduction: number | null;
          estimated_misalignment_year_shift: number | null;
          estimated_ped_reduction: number | null;
          affects_physical_risk: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          title: string;
          category?: ActionCategory;
          description?: string | null;
          estimated_saving_kwh?: number | null;
          estimated_saving_co2?: number | null;
          investment_cost?: number | null;
          currency?: string;
          payback_years?: number | null;
          status?: ActionStatus;
          priority_score?: number | null;
          planned_year?: number | null;
          completed_date?: string | null;
          source?: string;
          estimated_meps_gap_reduction?: number | null;
          estimated_misalignment_year_shift?: number | null;
          estimated_ped_reduction?: number | null;
          affects_physical_risk?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "actions_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      physical_risks: {
        Row: {
          id: string;
          property_id: string;
          risk_type: RiskType;
          probability: ProbabilityLevel;
          consequence: ConsequenceLevel;
          risk_score: number | null;
          source: string | null;
          assessed_at: string | null;
          notes: string | null;
          workflow_status: RiskWorkflowStatus;
          status_reason: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          risk_type: RiskType;
          probability: ProbabilityLevel;
          consequence: ConsequenceLevel;
          risk_score?: number | null;
          source?: string | null;
          assessed_at?: string | null;
          notes?: string | null;
          workflow_status?: RiskWorkflowStatus;
          status_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "physical_risks_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      action_applications: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      performance_adjustments: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      compliance_risks: {
        Row: {
          id: string;
          building_id: string;
          year: number;
          risk_kind: string;
          metric_value: number | null;
          severity: number | null;
          workflow_status: RiskWorkflowStatus;
          status_reason: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      mitigation_plans: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      mitigation_plan_items: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      data_edit_sessions: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      risk_scores: {
        Row: {
          id: string;
          building_id: string;
          year: number;
          meps_score: number | null;
          crrem_score: number | null;
          physical_score: number | null;
          data_quality_score: number | null;
          combined_score: number;
          calculated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      renovation_plans: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      renovation_plan_actions: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      data_quality_logs: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string | null;
          field: string | null;
          old_value: string | null;
          new_value: string | null;
          changed_by: string | null;
          changed_at: string;
          quality_class: QualityClass | null;
          override_reason: string | null;
          operation: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id?: string | null;
          field?: string | null;
          old_value?: string | null;
          new_value?: string | null;
          changed_by?: string | null;
          changed_at?: string;
          quality_class?: QualityClass | null;
          override_reason?: string | null;
          operation?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      meps_thresholds: {
        Row: {
          id: string;
          category: SpaceType;
          target_year: number;
          threshold_kwh_m2: number;
          regulation_ref: string | null;
          is_preliminary: boolean;
          valid_from: string;
          valid_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category: SpaceType;
          target_year: number;
          threshold_kwh_m2: number;
          regulation_ref?: string | null;
          is_preliminary?: boolean;
          valid_from?: string;
          valid_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      climate_data: {
        Row: {
          id: string;
          municipality: string;
          year: number;
          month: number | null;
          heating_degree_days: number;
          cooling_degree_days: number;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          municipality: string;
          year: number;
          month?: number | null;
          heating_degree_days?: number;
          cooling_degree_days?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      data_gap_config: {
        Row: {
          id: string;
          name: string;
          energy_type: EnergySourceType | null;
          space_type: SpaceType | null;
          max_missing_months_before_incomplete: number;
          interpolation_method: string;
          warning_threshold_months: number;
          is_default: boolean;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          energy_type?: EnergySourceType | null;
          space_type?: SpaceType | null;
          max_missing_months_before_incomplete?: number;
          interpolation_method?: string;
          warning_threshold_months?: number;
          is_default?: boolean;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      system_config: {
        Row: {
          id: string;
          key: string;
          value: Json;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: Json;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
      user_properties: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [
          {
            foreignKeyName: "user_properties_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_properties_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      ingestion_dead_letters: {
        Row: {
          id: string;
          batch_id: string;
          row_number: number;
          payload: Json;
          error_code: string;
          error_message: string;
          retry_count: number;
          max_retries: number;
          status: "pending" | "retrying" | "failed" | "resolved";
          last_error_at: string;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          row_number: number;
          payload: Json;
          error_code: string;
          error_message: string;
          retry_count?: number;
          max_retries?: number;
          status?: "pending" | "retrying" | "failed" | "resolved";
          last_error_at?: string;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { [key: string]: unknown };
        Relationships: [];
      };
    };
    Views: {
      spaces_safe: {
        Row: {
          id: string;
          building_id: string;
          name: string | null;
          space_type: SpaceType;
          tenant_name: string | null;
          has_tenant: boolean;
          contract_start: string | null;
          contract_end: string | null;
          loa: number | null;
          boa: number | null;
          is_heated: boolean;
          created_at: string;
          updated_at: string;
        };
        Relationships: [
          {
            foreignKeyName: "spaces_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      calculate_yearly_performance: {
        Args: {
          p_building_id: string;
          p_year: number;
          p_override?: boolean;
          p_override_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["performance_indicators"]["Row"];
      };
      calculate_crrem_stranding_year: {
        Args: {
          p_building_id: string;
          p_year: number;
          p_ghg_intensity?: number | null;
          p_crrem_version?: string;
          p_property_type?: string;
        };
        Returns: number | null;
      };
      set_space_tenant_name: {
        Args: {
          p_space_id: string;
          p_tenant_name: string;
        };
        Returns: null;
      };
      decrypt_tenant_name_audit: {
        Args: {
          p_space_id: string;
          p_reason?: string;
        };
        Returns: string | null;
      };
      apply_completed_action: {
        Args: {
          p_action_id: string;
          p_year?: number | null;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      insert_energy_consumption_manual: {
        Args: {
          p_building_id: string;
          p_energy_source_id: string;
          p_year: number;
          p_month: number;
          p_kwh: number;
          p_reason: string;
          p_is_estimated?: boolean;
          p_quality_class?: string;
        };
        Returns: string;
      };
      revert_action_application: {
        Args: { p_application_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      recalculate_performance_with_adjustments: {
        Args: {
          p_building_id: string;
          p_year: number;
          p_override?: boolean;
          p_override_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      set_physical_risk_status: {
        Args: {
          p_risk_id: string;
          p_status: RiskWorkflowStatus;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      set_compliance_risk_status: {
        Args: {
          p_risk_id: string;
          p_status: RiskWorkflowStatus;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      refresh_compliance_risks: {
        Args: { p_year: number };
        Returns: number;
      };
      detect_improvement_candidates: {
        Args: {
          p_min_intensity?: number;
          p_min_years?: number;
          p_min_improvement_pct?: number;
        };
        Returns: Record<string, unknown>[];
      };
      suggest_declaration_actions: {
        Args: Record<string, never>;
        Returns: number;
      };
      generate_mitigation_plan: {
        Args: { p_building_id: string; p_year?: number | null };
        Returns: string;
      };
      accept_mitigation_plan: {
        Args: { p_plan_id: string; p_item_ids?: string[] | null };
        Returns: Record<string, unknown>;
      };
      apply_energy_consumption_edit: {
        Args: {
          p_consumption_id: string;
          p_new_kwh: number;
          p_reason: string;
        };
        Returns: string;
      };
      apply_area_edit: {
        Args: { p_area_id: string; p_a_temp: number; p_reason: string };
        Returns: string;
      };
      rollback_data_edit: {
        Args: { p_session_id: string; p_reason: string };
        Returns: boolean;
      };
      calculate_combined_risk_score: {
        Args: { p_building_id: string; p_year: number };
        Returns: number;
      };
      recalculate_after_action: {
        Args: { p_action_id: string; p_year?: number | null };
        Returns: Record<string, unknown>;
      };
      generate_renovation_plan: {
        Args: {
          p_building_id: string;
          p_year?: number | null;
          p_title?: string | null;
        };
        Returns: string;
      };
      simulate_action_impact: {
        Args: {
          p_action_id: string;
          p_year?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      simulate_actions_package: {
        Args: {
          p_building_id: string;
          p_action_ids: string[];
          p_year?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      create_renovation_plan_from_actions: {
        Args: {
          p_building_id: string;
          p_action_ids: string[];
          p_year?: number | null;
          p_title?: string | null;
          p_scenario_key?: string | null;
        };
        Returns: string;
      };
      project_performance_with_virtual_delta: {
        Args: {
          p_building_id: string;
          p_year: number;
          p_extra_delta_kwh?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      refresh_all_risk_scores: {
        Args: { p_year: number };
        Returns: number;
      };
      refresh_performance_compliance_fields: {
        Args: { p_building_id: string; p_year: number };
        Returns: null;
      };
    };
    Enums: {
      user_role: UserRole;
      space_type: SpaceType;
      quality_class: QualityClass;
      energy_class: EnergyClass;
      data_gap_status: DataGapStatus;
      ownership_type: OwnershipType;
      property_status: PropertyStatus;
      energy_source_type: EnergySourceType;
      emission_scope: EmissionScope;
      action_status: ActionStatus;
      action_category: ActionCategory;
      risk_type: RiskType;
      probability_level: ProbabilityLevel;
      consequence_level: ConsequenceLevel;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
