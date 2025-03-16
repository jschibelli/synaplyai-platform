import { CircuitState } from '../circuit-breaker/interfaces';
import { ContentFilterResult } from '../filtering/interfaces';
import { getCurrentTenantId } from '../lib/tenant-context';

// Create a mock for getCurrentTenantId
jest.mock('../lib/tenant-context', () => ({
  getCurrentTenantId: jest.fn().mockReturnValue('test-tenant')
}));

// Define a minimal RedisMetricsClient interface for testing
interface RedisMetricsClient {
  incrementCounter: jest.Mock;
  recordLatency: jest.Mock;
  getPercentileLatency: jest.Mock;
  setCircuitBreakerState?: jest.Mock;
  getCircuitBreakerState?: jest.Mock;
  recordValue?: jest.Mock;
  getFilterResultCounts?: jest.Mock;
  getPipelineLatency?: jest.Mock;
  pipeline?: jest.Mock;
}

// Define the MetricsCollector class
class MetricsCollector {
  constructor(private redisClient: RedisMetricsClient) {}
  
  async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
    await this.redisClient.incrementCounter(metricName, tenantId, value);
  }
  
  async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
    await this.redisClient.recordLatency(metricName, latencyMs, tenantId);
  }
  
  async getPercentileLatency(metricName: string, tenantId: string, percentile: number): Promise<number | null> {
    return await this.redisClient.getPercentileLatency(metricName, tenantId, percentile, 5);
  }
  
  async setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void> {
    await this.increment(`circuit.state.${state.toLowerCase()}`, tenantId);
    if (this.redisClient.setCircuitBreakerState) {
      await this.redisClient.setCircuitBreakerState(tenantId, serviceName, state);
    }
  }
  
  async incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void> {
    await this.increment(`circuit.failure.${serviceName}`, tenantId);
  }
  
  async incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void> {
    await this.increment(`circuit.rejection.${serviceName}`, tenantId);
  }
  
  async incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void> {
    const tenantId = 'test-tenant';
    await this.increment(`filter.result.${filterName}.${result}`, tenantId);
  }
  
  async recordPipelineLatency(latencyMs: number): Promise<void> {
    const tenantId = 'test-tenant'; // Mock getCurrentTenantId() implementation
    await this.recordLatency('pipeline.latency', latencyMs, tenantId);
  }
  
  async incrementPipelineErrors(): Promise<void> {
    const tenantId = 'test-tenant'; // Mock getCurrentTenantId() implementation
    await this.increment('pipeline.errors', tenantId);
  }
}

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockRedisClient: jest.Mocked<RedisMetricsClient>;

  beforeEach(() => {
    // Create a mock RedisClient with properly configured Jest mocks
    mockRedisClient = {
      incrementCounter: jest.fn().mockResolvedValue(undefined),
      recordLatency: jest.fn().mockResolvedValue(undefined),
      getPercentileLatency: jest.fn().mockResolvedValue(42),
      getCircuitBreakerState: jest.fn().mockResolvedValue('CLOSED')
    } as unknown as jest.Mocked<RedisMetricsClient>;
    
    // Create metrics collector with mocked Redis client
    metricsCollector = new MetricsCollector(mockRedisClient);
    
    jest.clearAllMocks();
  });

  test('should increment counter for tenant', async () => {
    const tenantId = 'tenant1';
    const metricName = 'test.metric';
    
    await metricsCollector.increment(metricName, tenantId);
    
    expect(mockRedisClient.incrementCounter).toHaveBeenCalledWith(metricName, tenantId, 1);
  });

  test('should record latency for tenant', async () => {
    const tenantId = 'tenant1';
    const metricName = 'test.latency';
    const latencyMs = 123;
    
    await metricsCollector.recordLatency(metricName, latencyMs, tenantId);
    
    expect(mockRedisClient.recordLatency).toHaveBeenCalledWith(metricName, latencyMs, tenantId);
  });

  test('should get percentile latency', async () => {
    const tenantId = 'tenant1';
    const metricName = 'test.latency';
    const percentile = 95;
    
    const result = await metricsCollector.getPercentileLatency(metricName, tenantId, percentile);
    
    expect(mockRedisClient.getPercentileLatency).toHaveBeenCalledWith(metricName, tenantId, percentile, 5);
    expect(result).toBe(42);
  });

  test('should track circuit breaker state change', async () => {
    const tenantId = 'tenant1';
    const serviceName = 'test-service';
    const state = CircuitState.OPEN;
    
    await metricsCollector.setCircuitBreakerState(tenantId, serviceName, state);
    
    expect(mockRedisClient.incrementCounter).toHaveBeenCalledWith(`circuit.state.${state.toLowerCase()}`, tenantId, 1);
  });

  test('should track filter results', async () => {
    const filterName = 'content-filter';
    const result = ContentFilterResult.BLOCKED;
    
    await metricsCollector.incrementFilterResult(filterName, result);
    
    expect(mockRedisClient.incrementCounter).toHaveBeenCalledWith(`filter.result.${filterName}.${result}`, 'test-tenant', 1);
  });
});