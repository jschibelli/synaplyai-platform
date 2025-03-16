import { ShardedRedisClient } from '../metrics/sharded-redis';
import { CircuitBreakerStore, CircuitState } from '../circuit-breaker/interfaces';
import { FeatureFlagService } from '../features/flag-service';
import { prisma } from '../lib/prisma';

interface DashboardMetrics {
  apiLatency: {
    p95: number;
    p99: number;
    average: number;
  };
  requestVolume: number;
  errorRate: number;
  circuitBreakerStatus: {
    [serviceName: string]: {
      state: CircuitState;
      failures: number;
      lastStateChange: Date | null;
    };
  };
  featureFlags: {
    [flagName: string]: {
      enabled: boolean;
      conditions?: Record<string, any>;
    };
  };
}

export class OperationalDashboard {
  private redisClient: ShardedRedisClient;
  private circuitBreakerStore: CircuitBreakerStore;
  private featureFlagService: FeatureFlagService;
  
  constructor(
    redisClient: ShardedRedisClient,
    circuitBreakerStore: CircuitBreakerStore,
    featureFlagService: FeatureFlagService
  ) {
    this.redisClient = redisClient;
    this.circuitBreakerStore = circuitBreakerStore;
    this.featureFlagService = featureFlagService;
  }
  
  /**
   * Get dashboard metrics for a specific tenant
   */
  async getTenantDashboard(tenantId: string): Promise<DashboardMetrics> {
    // Execute all async operations in parallel for better performance
    const [
      p95Latency,
      p99Latency,
      avgLatency,
      requestVolume,
      errors,
      circuitBreakers,
      featureFlags
    ] = await Promise.all([
      this.redisClient.getPercentileLatency('api.latency', tenantId, 95, 5),
      this.redisClient.getPercentileLatency('api.latency', tenantId, 99, 5),
      this.getAverageLatency(tenantId),
      this.getTotalRequestVolume(tenantId),
      this.getErrorCount(tenantId),
      this.getCircuitBreakerStatuses(tenantId),
      this.getFeatureFlagStatuses(tenantId)
    ]);
    
    return {
      apiLatency: {
        p95: p95Latency || 0,
        p99: p99Latency || 0,
        average: avgLatency || 0
      },
      requestVolume: requestVolume || 0,
      errorRate: requestVolume ? (errors / requestVolume) : 0,
      circuitBreakerStatus: circuitBreakers,
      featureFlags: featureFlags
    };
  }
  
  /**
   * Get average API latency for a tenant
   */
  private async getAverageLatency(tenantId: string): Promise<number> {
    const stats = await this.redisClient.getRollupStats(tenantId, 'api.latency', 'minute');
    return stats ? stats.avg : 0;
  }
  
  /**
   * Get total request volume for a tenant
   */
  private async getTotalRequestVolume(tenantId: string): Promise<number> {
    const metrics = await this.redisClient.getMetrics(tenantId, 'requests.total', 'hour', 1);
    return metrics.length > 0 ? metrics[0].value : 0;
  }
  
  /**
   * Get error count for a tenant
   */
  private async getErrorCount(tenantId: string): Promise<number> {
    const metrics = await this.redisClient.getMetrics(tenantId, 'errors.total', 'hour', 1);
    return metrics.length > 0 ? metrics[0].value : 0;
  }
  
  /**
   * Get circuit breaker statuses for a tenant
   */
  private async getCircuitBreakerStatuses(tenantId: string): Promise<DashboardMetrics['circuitBreakerStatus']> {
    // This is a simplified implementation - in a real system you'd have a registry of services
    const services = ['api', 'database', 'auth', 'storage', 'email'];
    const result: DashboardMetrics['circuitBreakerStatus'] = {};
    
    for (const service of services) {
      const circuitKey = `${tenantId}:${service}`;
      const [state, lastChangeTime] = await Promise.all([
        this.circuitBreakerStore.getState(circuitKey),
        this.circuitBreakerStore.getLastStateChange(circuitKey)
      ]);
      
      // Get failure count if available
      let failures = 0;
      try {
        failures = parseInt(await this.redisClient.getShardForTenant(tenantId).get(`circuit:${circuitKey}:failures`) || '0', 10);
      } catch (error) {
        console.error('Error fetching failure count:', error);
      }
      
      result[service] = {
        state: state || CircuitState.CLOSED,
        failures,
        lastStateChange: lastChangeTime
      };
    }
    
    return result;
  }
  
  /**
   * Get feature flag statuses for a tenant
   */
  private async getFeatureFlagStatuses(tenantId: string): Promise<DashboardMetrics['featureFlags']> {
    const flags = await this.featureFlagService.getAllFlags(tenantId);
    const result: DashboardMetrics['featureFlags'] = {};
    
    for (const flag of flags) {
      result[flag.name] = {
        enabled: flag.enabled,
        conditions: flag.conditions
      };
    }
    
    return result;
  }
  
  /**
   * Get event timeline for a specific tenant
   */
  async getEventTimeline(
    tenantId: string, 
    startTime: Date, 
    endTime: Date,
    eventTypes?: string[]
  ): Promise<Array<{
    timestamp: Date;
    eventType: string;
    description: string;
    resourceId?: string;
    metadata?: any;
  }>> {
    const where = {
      tenantId,
      createdAt: {
        gte: startTime,
        lte: endTime
      },
      ...(eventTypes && eventTypes.length > 0 ? { eventType: { in: eventTypes } } : {})
    };
    
    const events = await prisma.complianceLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventType: true,
        description: true,
        resourceId: true,
        createdAt: true,
        metadata: true
      },
      take: 500 // Limit to prevent performance issues
    });
    
    return events.map(event => ({
      timestamp: event.createdAt,
      eventType: event.eventType,
      description: event.description,
      resourceId: event.resourceId || undefined,
      metadata: event.metadata ? JSON.parse(event.metadata as string) : undefined
    }));
  }
  
  /**
   * Get breaker state changes timeline
   */
  async getBreakerStateChanges(
    tenantId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Array<{
    timestamp: Date;
    serviceName: string;
    state: CircuitState;
    reason?: string;
  }>> {
    const events = await prisma.complianceLog.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startTime,
          lte: endTime
        },
        eventType: {
          in: ['circuit.opened', 'circuit.closed', 'circuit.half_open']
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    return events.map(event => {
      const metadata = event.metadata ? JSON.parse(event.metadata as string) : {};
      
      return {
        timestamp: event.createdAt,
        serviceName: event.resourceId || 'unknown',
        state: this.getCircuitStateFromEvent(event.eventType),
        reason: metadata.error || metadata.reason || undefined
      };
    });
  }
  
  private getCircuitStateFromEvent(eventType: string): CircuitState {
    switch (eventType) {
      case 'circuit.opened': return CircuitState.OPEN;
      case 'circuit.closed': return CircuitState.CLOSED;
      case 'circuit.half_open': return CircuitState.HALF_OPEN;
      default: return CircuitState.CLOSED;
    }
  }
}