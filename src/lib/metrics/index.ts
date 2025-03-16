import { getCurrentTenantId, getCurrentUserId } from '../tenantContext';

export interface MetricPoint {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: MetricPoint[] = [];

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  track(name: string, value: number, additionalTags: Record<string, string> = {}): void {
    const tenantId = getCurrentTenantId() || 'unknown';
    const userId = getCurrentUserId() || 'anonymous';

    this.metrics.push({
      name,
      value,
      tags: {
        tenantId,
        userId,
        ...additionalTags
      },
      timestamp: new Date()
    });
  }

  getMetrics(): MetricPoint[] {
    return this.metrics;
  }

  clear(): void {
    this.metrics = [];
  }
}