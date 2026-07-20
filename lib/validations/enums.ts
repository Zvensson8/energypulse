import { z } from "zod";

/** Enums that mirror public PostgreSQL types from Fas 1. */

export const userRoleSchema = z.enum([
  "admin",
  "portfolio_manager",
  "property_manager",
  "viewer",
]);

export const spaceTypeSchema = z.enum([
  "office",
  "retail",
  "warehouse",
  "industrial",
  "hotel",
  "education",
  "healthcare",
  "mixed",
  "other",
]);

export const qualityClassSchema = z.enum(["A", "B", "C", "D"]);

export const energyClassSchema = z.enum(["A", "B", "C", "D", "E", "F", "G"]);

export const dataGapStatusSchema = z.enum([
  "COMPLETE",
  "EXTRAPOLATED_WARNING",
  "INCOMPLETE_DATA",
]);

export const ownershipTypeSchema = z.enum([
  "owned",
  "leased",
  "joint_venture",
  "other",
]);

export const propertyStatusSchema = z.enum([
  "active",
  "disposed",
  "under_development",
  "inactive",
]);

export const energySourceTypeSchema = z.enum([
  "electricity",
  "district_heating",
  "district_cooling",
  "natural_gas",
  "oil",
  "biofuel",
  "other",
]);

export const emissionScopeSchema = z.enum(["scope1", "scope2", "scope3"]);

export const actionStatusSchema = z.enum([
  "proposed",
  "approved",
  "in_progress",
  "completed",
  "cancelled",
]);

export const actionCategorySchema = z.enum([
  "envelope",
  "hvac",
  "lighting",
  "controls",
  "renewable",
  "behaviour",
  "other",
]);

export const riskTypeSchema = z.enum([
  "flood",
  "heat",
  "storm",
  "subsidence",
  "wildfire",
  "other",
]);

export const probabilityLevelSchema = z.enum([
  "low",
  "medium",
  "high",
  "very_high",
]);

export const consequenceLevelSchema = z.enum([
  "low",
  "medium",
  "high",
  "very_high",
]);

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD");

export const isoTimestamptzSchema = z.string().datetime({ offset: true }).or(z.string().min(1));
