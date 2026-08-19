export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return "info";
}

export class Logger {
  constructor(private readonly context: string) {}

  private shouldLog(level: LogLevel): boolean {
    const currentLevel = getCurrentLogLevel();
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5, " ");
    return `[${timestamp}] [${levelStr}] [${this.context}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      if (args.length > 0) {
        console.debug(this.formatMessage("debug", message), ...args);
      } else {
        console.debug(this.formatMessage("debug", message));
      }
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      if (args.length > 0) {
        console.info(this.formatMessage("info", message), ...args);
      } else {
        console.info(this.formatMessage("info", message));
      }
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      if (args.length > 0) {
        console.warn(this.formatMessage("warn", message), ...args);
      } else {
        console.warn(this.formatMessage("warn", message));
      }
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      if (args.length > 0) {
        console.error(this.formatMessage("error", message), ...args);
      } else {
        console.error(this.formatMessage("error", message));
      }
    }
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
