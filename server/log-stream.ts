import { EventEmitter } from "events";

/**
 * Log streaming service for Debug Console
 * Captures server logs and streams them to connected clients
 */

export type LogEntry = {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source: "server" | "local";
};

class LogStreamService extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory
  private logId = 0;

  constructor() {
    super();
    this.interceptConsole();
  }

  /**
   * Intercept console methods to capture logs
   */
  private interceptConsole() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      this.addLog("info", args.join(" "), "server");
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      this.addLog("error", args.join(" "), "server");
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      this.addLog("warn", args.join(" "), "server");
    };
  }

  /**
   * Add a log entry
   */
  addLog(level: LogEntry["level"], message: string, source: LogEntry["source"] = "server") {
    const entry: LogEntry = {
      id: `log-${this.logId++}`,
      timestamp: Date.now(),
      level,
      message,
      source,
    };

    this.logs.push(entry);

    // Trim logs if exceeds max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Emit to subscribers
    this.emit("log", entry);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    this.emit("clear");
  }
}

// Singleton instance
export const logStream = new LogStreamService();
