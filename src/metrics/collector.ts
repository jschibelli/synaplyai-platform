import { RedisMetricsClient } from './redis-client';
import { MetricsCollector as IMetricsCollector, TimeGranularity } from './interfaces';
import { CircuitState } from '../circuit-breaker/interfaces';
import { ContentFilterResult } from '../filtering/interfaces';
import { getCurrentTenantId } from '../lib/tenantContext';

interface TimeBucket {
    minute: number;
    hour: number;
    day: number;
}

interface RollingMetrics {
    window: number;  // Window size in seconds
    buckets: number; // Number of buckets to maintain
    values: number[];
    timestamps: number[];
}

export class MetricsCollector implements IMetricsCollector {
    private rollingWindows: Map<string, RollingMetrics> = new Map();
    
    constructor(private redisClient: RedisMetricsClient) {}

    async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
        await this.redisClient.increment(metricName, tenantId, value);
    }

    async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
        await this.redisClient.recordLatency(metricName, latencyMs, tenantId);
    }

    async getPercentileLatency(
        metricName: string,
        tenantId: string,
        percentile: number,
        timeWindowMinutes = 5
    ): Promise<number> {
        return await this.redisClient.getPercentileLatency(
            metricName,
            tenantId,
            percentile,
            timeWindowMinutes
        );
    }

    async getMetricCounts(
        metricName: string,
        tenantId: string,
        granularity: 'minute' | 'hour' | 'day' = 'hour',
        limit: number = 24
    ): Promise<{timestamp: string; value: number}[]> {
        return await this.redisClient.getMetricCounts(
            metricName,
            tenantId,
            granularity,
            limit
        );
    }

    // Circuit breaker metrics implementation
    async setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void> {
        await this.increment(`circuit.state.${state.toLowerCase()}`, tenantId);
        await this.redisClient.setCircuitBreakerState(tenantId, serviceName, state);
    }

    async incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void> {
        await this.increment(`circuit.failure.${serviceName}`, tenantId);
    }

    async incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void> {
        await this.increment(`circuit.rejection.${serviceName}`, tenantId);
    }

    async getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null> {
        return await this.redisClient.getCircuitBreakerState(tenantId, serviceName);
    }

    // Content filtering metrics implementation
    async incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.increment(`filter.result.${filterName}.${result}`, tenantId);
    }

    async recordFilterLatency(filterName: string, latencyMs: number): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.recordLatency(`filter.latency.${filterName}`, latencyMs, tenantId);
    }

    async recordPipelineLatency(latencyMs: number): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.recordLatency('pipeline.latency', latencyMs, tenantId);
    }

    async incrementPipelineResult(result: ContentFilterResult): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.increment(`pipeline.result.${result}`, tenantId);
    }

    async incrementPipelineErrors(): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.increment('pipeline.errors', tenantId);
    }

    // Custom metrics implementation
    async incrementCounter(name: string, tags?: Record<string, string>): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.increment(name, tenantId);
        
        if (tags) {
            for (const [key, value] of Object.entries(tags)) {
                await this.increment(`${name}.${key}.${value}`, tenantId);
            }
        }
    }

    async recordValue(name: string, value: number, tags?: Record<string, string>): Promise<void> {
        const tenantId = getCurrentTenantId();
        await this.redisClient.recordValue(name, value, tenantId);
        
        if (tags) {
            for (const [key, tagValue] of Object.entries(tags)) {
                await this.redisClient.recordValue(`${name}.${key}.${tagValue}`, value, tenantId);
            }
        }
    }

    // Retrieve metrics
    async getFilterResultCounts(filterName: string, timeWindow: TimeGranularity): Promise<Record<ContentFilterResult, number>> {
        const tenantId = getCurrentTenantId();
        return await this.redisClient.getFilterResultCounts(filterName, timeWindow, tenantId);
    }

    async getPipelineLatency(percentile: number, timeWindow: TimeGranularity): Promise<number | null> {
        const tenantId = getCurrentTenantId();
        return await this.redisClient.getPipelineLatency(percentile, timeWindow, tenantId);
    }
}

export class EnhancedMetricsCollector extends MetricsCollector {
    private rollingWindows: Map<string, RollingMetrics> = new Map();

    async trackLatencyWithHistogram(operation: string, duration: number): Promise<void> {
        const key = `latency:${operation}`;
        const window = 300; // 5 minute window
        const buckets = 60;  // 5-second buckets

        let metrics = this.rollingWindows.get(key);
        if (!metrics) {
            metrics = { window, buckets, values: [], timestamps: [] };
            this.rollingWindows.set(key, metrics);
        }

        // Add new measurement
        metrics.values.push(duration);
        metrics.timestamps.push(Date.now());

        // Prune old data
        const cutoff = Date.now() - (window * 1000);
        while (metrics.timestamps[0] < cutoff) {
            metrics.values.shift();
            metrics.timestamps.shift();
        }
    }

    async getLatencyHistogram(operation: string): Promise<{
        p50: number;
        p95: number;
        p99: number;
        mean: number;
        stdDev: number;
    }> {
        const metrics = this.rollingWindows.get(`latency:${operation}`);
        if (!metrics || metrics.values.length === 0) {
            return { p50: 0, p95: 0, p99: 0, mean: 0, stdDev: 0 };
        }

        const sorted = [...metrics.values].sort((a, b) => a - b);
        return {
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
            mean: sorted.reduce((a, b) => a + b) / sorted.length,
            stdDev: this.calculateStdDev(sorted)
        };
    }

    async trackDetailedLatency(operation: string, duration: number): Promise<void> {
        const tenantId = getCurrentTenantId();
        const minute = Math.floor(Date.now() / 60000);
        const hour = Math.floor(minute / 60);
        
        const pipeline = this.redisClient.pipeline();
        
        // Update minute-level metrics
        pipeline.zadd(`metrics:${tenantId}:${operation}:${minute}`, duration, Date.now());
        pipeline.expire(`metrics:${tenantId}:${operation}:${minute}`, 3600); // 1 hour
        
        // Update hour-level aggregates
        pipeline.hincrby(`metrics:${tenantId}:${operation}:${hour}`, 'count', 1);
        pipeline.hincrby(`metrics:${tenantId}:${operation}:${hour}`, 'sum', duration);
        pipeline.expire(`metrics:${tenantId}:${operation}:${hour}`, 86400); // 24 hours
        
        await pipeline.exec();
    }

    private calculateStdDev(values: number[]): number {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(x => Math.pow(x - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(variance);
    }
}