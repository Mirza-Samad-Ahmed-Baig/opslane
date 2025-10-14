export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

class Logger {
  private isDev = import.meta.env.DEV;

  debug(message: string, context?: Record<string, unknown>) {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    console.info(`[INFO] ${message}`, context || '');
  }

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(`[WARN] ${message}`, context || '');
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    console.error(`[ERROR] ${message}`, {
      ...context,
      error: error?.message,
      stack: error?.stack,
    });
  }
}

export const logger = new Logger();
