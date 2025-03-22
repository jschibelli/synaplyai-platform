import { getCurrentTenantId, getCurrentUserId } from '../tenantContext';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  tenantId?: string;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  
  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  async log(entry: LogEntry): Promise<void> {
    const tenantId = entry.tenantId || getCurrentTenantId();
    const userId = entry.userId || getCurrentUserId();

    console.log(JSON.stringify({
      ...entry,
      tenantId,
      userId,
      timestamp: entry.timestamp.toISOString()
    }));
  }

  async error(message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    await this.log({
      level: 'error',
      message,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        errorMessage: error?.message,
        stack: error?.stack
      }
    });
  }

  async logContentFilter(content: string, reasons: string[]): Promise<void> {
    await this.log({
      level: 'warn',
      message: 'Content filtered',
      timestamp: new Date(),
      metadata: {
        reasons,
        contentPreview: content.substring(0, 100)
      }
    });
  }
}