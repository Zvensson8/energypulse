import { z } from "zod";
import { uuidSchema } from "./enums";

export const riskWorkflowStatusSchema = z.enum([
  "open",
  "monitoring",
  "resolved",
  "dismissed",
]);

export const completeActionSchema = z.object({
  action_id: uuidSchema,
  year: z.number().int().min(2000).max(2100).optional(),
  reason: z.string().max(500).optional(),
});

export const simulateActionSchema = z.object({
  action_id: uuidSchema,
  year: z.number().int().min(2000).max(2100).optional(),
});

export const simulatePackageSchema = z.object({
  building_id: uuidSchema,
  action_ids: z.array(uuidSchema).min(1).max(20),
  year: z.number().int().min(2000).max(2100).optional(),
});

export const generateScenariosSchema = z.object({
  building_id: uuidSchema,
  year: z.number().int().min(2000).max(2100).optional(),
});

export const selectScenarioSchema = z.object({
  building_id: uuidSchema,
  action_ids: z.array(uuidSchema).min(1).max(20),
  year: z.number().int().min(2000).max(2100).optional(),
  scenario_key: z
    .enum(["economy", "balanced", "aggressive", "custom"])
    .optional(),
  title: z.string().max(200).optional(),
});

export const revertApplicationSchema = z.object({
  application_id: uuidSchema,
  reason: z.string().trim().min(5).max(500),
});

export const setRiskStatusSchema = z.object({
  risk_id: uuidSchema,
  kind: z.enum(["physical", "compliance"]),
  status: riskWorkflowStatusSchema,
  reason: z.string().trim().min(5).max(500).optional(),
});

export const generatePlanSchema = z.object({
  building_id: uuidSchema,
  year: z.number().int().optional(),
});

export const acceptPlanSchema = z.object({
  plan_id: uuidSchema,
  item_ids: z.array(uuidSchema).optional(),
});

export const editConsumptionSchema = z.object({
  consumption_id: uuidSchema,
  consumption_kwh: z.number().finite().min(0),
  reason: z.string().trim().min(5).max(500),
});

export const editAreaSchema = z.object({
  area_id: uuidSchema,
  a_temp: z.number().finite().positive(),
  reason: z.string().trim().min(5).max(500),
});

export const rollbackEditSchema = z.object({
  session_id: uuidSchema,
  reason: z.string().trim().min(5).max(500),
});

export type RiskWorkflowStatus = z.infer<typeof riskWorkflowStatusSchema>;
