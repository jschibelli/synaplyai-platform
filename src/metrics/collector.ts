import { RedisMetricsClient } from './redis-client';

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

export class MetricsCollector {
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
}

export class EnhancedMetricsCollector {
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
}