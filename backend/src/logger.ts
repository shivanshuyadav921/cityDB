/**
 * Structured JSON logger for CityDB backend.
 * Outputs JSON lines to stdout/stderr so Railway and other platforms
 * can parse and index log entries automatically.
 * Never logs sensitive data (passwords, full SQL contents at INFO level).
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  info(msg: string, meta?: Record<string, unknown>): void {
    emit("info", msg, meta);
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    emit("warn", msg, meta);
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    emit("error", msg, meta);
  },
};
