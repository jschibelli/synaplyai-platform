import { UsageMetrics } from '../models/UsageMetrics';
import { getCurrentTenantContext } from '../lib/tenant-context';

interface TenantMetrics extends UsageMetrics {
  tenantId: string;
  timestamp: Date;
  modelId?: string;
}

export class UsageMetricsRepository {
  private metrics: TenantMetrics[] = [];

  public async save(metrics: TenantMetrics): Promise<void> {
    const context = getCurrentTenantContext();
    if (!context) {
        throw new Error('No tenant context found');
    }

    // Check if metrics for this tenant/timestamp already exist
    const existingIndex = this.metrics.findIndex(m => 
      m.tenantId === metrics.tenantId && 
      m.timestamp.getTime() === metrics.timestamp.getTime()
    );

    if (existingIndex >= 0) {
      // Update existing metrics
      this.metrics[existingIndex] = {
        ...this.metrics[existingIndex],
        totalRequestTokens: this.metrics[existingIndex].totalRequestTokens + metrics.totalRequestTokens,
        totalResponseTokens: this.metrics[existingIndex].totalResponseTokens + metrics.totalResponseTokens
      };
    } else {
      // Add new metrics
      this.metrics.push(metrics);
    }
  }

  public async getAll(): Promise<TenantMetrics[]> {
    return this.metrics;
  }

  public async getByTenantId(tenantId: string): Promise<TenantMetrics[]> {
    return this.metrics.filter(metric => metric.tenantId === tenantId);
  }

  public async getByTenantIdAndTimeRange(
    tenantId: string, 
    startTime: Date, 
    endTime: Date
  ): Promise<TenantMetrics[]> {
    return this.metrics.filter(metric => 
      metric.tenantId === tenantId &&
      metric.timestamp >= startTime &&
      metric.timestamp <= endTime
    );
  }

  public async getTotalUsageByTenant(tenantId: string): Promise<{
    totalRequestTokens: number;
    totalResponseTokens: number;
  }> {
    const tenantMetrics = await this.getByTenantId(tenantId);
    return tenantMetrics.reduce((acc, metric) => ({
      totalRequestTokens: acc.totalRequestTokens + metric.totalRequestTokens,
      totalResponseTokens: acc.totalResponseTokens + metric.totalResponseTokens
    }), {
      totalRequestTokens: 0,
      totalResponseTokens: 0
    });
  }

  public async clear(): Promise<void> {
    this.metrics = [];
  }
}