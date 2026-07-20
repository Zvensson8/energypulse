/**
 * Structured logging for EnergyPulse server-side code.
 * JSON lines suitable for Vercel / platform log aggregation.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel()];
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "energypulse",
    message,
    ...context,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),

  /** Child logger with fixed context (e.g. batchId, buildingId). */
  child(base: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        emit("debug", message, { ...base, ...context }),
      info: (message: string, context?: LogContext) =>
        emit("info", message, { ...base, ...context }),
      warn: (message: string, context?: LogContext) =>
        emit("warn", message, { ...base, ...context }),
      error: (message: string, context?: LogContext) =>
        emit("error", message, { ...base, ...context }),
    };
  },
};
