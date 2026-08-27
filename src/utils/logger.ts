import pino, { Logger as PinoLogger } from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (
    envLevel === "debug" ||
    envLevel === "info" ||
    envLevel === "warn" ||
    envLevel === "error" ||
    envLevel === "silent"
  ) {
    return envLevel;
  }
  return "info";
}

const isPretty = process.env.LOG_FORMAT !== "json" && process.env.NODE_ENV !== "production";

const rootLogger: PinoLogger = pino({
  level: getLogLevel(),
  transport: isPretty
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

export class Logger {
  private readonly pino: PinoLogger;

  constructor(public readonly context: string) {
    this.pino = rootLogger.child({ context });
  }

  debug(message: unknown, ...args: unknown[]): void {
    if (typeof message === "object" && message !== null) {
      const msg = typeof args[0] === "string" ? args[0] : undefined;
      this.pino.debug(message as object, msg);
    } else if (args.length > 0) {
      this.pino.debug({ extra: args }, String(message));
    } else {
      this.pino.debug(String(message));
    }
  }

  info(message: unknown, ...args: unknown[]): void {
    if (typeof message === "object" && message !== null) {
      const msg = typeof args[0] === "string" ? args[0] : undefined;
      this.pino.info(message as object, msg);
    } else if (args.length > 0) {
      this.pino.info({ extra: args }, String(message));
    } else {
      this.pino.info(String(message));
    }
  }

  warn(message: unknown, ...args: unknown[]): void {
    if (typeof message === "object" && message !== null) {
      const msg = typeof args[0] === "string" ? args[0] : undefined;
      this.pino.warn(message as object, msg);
    } else if (args.length > 0) {
      this.pino.warn({ extra: args }, String(message));
    } else {
      this.pino.warn(String(message));
    }
  }

  error(message: unknown, ...args: unknown[]): void {
    if (typeof message === "object" && message !== null) {
      const msg = typeof args[0] === "string" ? args[0] : undefined;
      this.pino.error(message as object, msg);
    } else if (args.length > 0) {
      this.pino.error({ extra: args }, String(message));
    } else {
      this.pino.error(String(message));
    }
  }

  getPino(): PinoLogger {
    return this.pino;
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
