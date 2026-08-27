import { pino } from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const logLevel: LogLevel = (process.env["LOG_LEVEL"] as LogLevel) || "info";
const isDevelopment = process.env["NODE_ENV"] !== "production";
const usePretty = process.env["LOG_FORMAT"] === "pretty" || isDevelopment;

const rootLogger = pino({
  level: logLevel,
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

export function createLogger(context: string) {
  return rootLogger.child({ context });
}

export { rootLogger };
