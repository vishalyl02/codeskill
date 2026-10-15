/**
 * Lightweight, zero-dependency structured logger for frontend-v2.
 * Formats client logs with ISO timestamp, severity level, context, URL, and metadata.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface StructuredLogPayload {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  url?: string;
  meta?: Record<string, unknown>;
}

class ClientLogger {
  private readonly isBrowser = typeof window !== 'undefined';

  private format(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    context = 'App',
  ): StructuredLogPayload {
    return {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      url: this.isBrowser ? window.location.pathname : undefined,
      meta,
    };
  }

  info(message: string, meta?: Record<string, unknown>, context = 'App'): void {
    try {
      const payload = this.format('info', message, meta, context);
      console.info(
        `[${payload.timestamp}] [INFO] [${payload.context}]: ${payload.message}`,
        payload.meta ? payload.meta : '',
      );
    } catch {
      // Fail-safe
    }
  }

  warn(message: string, meta?: Record<string, unknown>, context = 'App'): void {
    try {
      const payload = this.format('warn', message, meta, context);
      console.warn(
        `[${payload.timestamp}] [WARN] [${payload.context}]: ${payload.message}`,
        payload.meta ? payload.meta : '',
      );
    } catch {
      // Fail-safe
    }
  }

  error(message: string, meta?: Record<string, unknown>, context = 'App'): void {
    try {
      const payload = this.format('error', message, meta, context);
      console.error(
        `[${payload.timestamp}] [ERROR] [${payload.context}]: ${payload.message}`,
        payload.meta ? payload.meta : '',
      );
    } catch {
      // Fail-safe
    }
  }

  debug(message: string, meta?: Record<string, unknown>, context = 'App'): void {
    try {
      if (process.env.NODE_ENV !== 'production') {
        const payload = this.format('debug', message, meta, context);
        console.debug(
          `[${payload.timestamp}] [DEBUG] [${payload.context}]: ${payload.message}`,
          payload.meta ? payload.meta : '',
        );
      }
    } catch {
      // Fail-safe
    }
  }
}

export const logger = new ClientLogger();
