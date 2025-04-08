# Usage Tracking System

## Overview

The Usage Tracking System monitors and controls AI service consumption across tenants, ensuring budget compliance, fair resource allocation, and detailed billing capabilities. This document outlines the architecture, components, and integration with the broader compliance framework.

## Architecture

The usage tracking system consists of several interconnected components:

```
┌─────────────────┐     ┌────────────────────┐     ┌─────────────────┐
│   AI Service    │────▶│  Usage Interceptor │────▶│ Usage Repository │
│   Requests      │     │                    │     │                  │
└─────────────────┘     └────────────────────┘     └────────┬────────┘
                               │                           │
                               ▼                           ▼
                        ┌────────────────┐         ┌─────────────────┐
                        │ Token Counter  │         │  Cost Calculator │
                        │                │         │                  │
                        └────────────────┘         └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌────────────────┐         ┌─────────────────┐
                        │ Budget Control │         │ Compliance      │
                        │                │         │ Logger          │
                        └────────────────┘         └─────────────────┘
```

## Key Components

### 1. Usage Interceptor

The Usage Interceptor sits between AI service requests and the actual API calls, capturing details about each request:

```typescript
// Example interceptor for OpenAI
class OpenAIUsageInterceptor {
  constructor(private usageRepository: UsageRepository) {}

  async interceptRequest(params: ChatCompletionCreateParams, tenant: string) {
    const startTime = performance.now();
    const model = params.model;
    
    // Pre-request tracking
    await this.usageRepository.recordRequest({
      tenantId: tenant,
      modelId: model,
      inputTokens: estimateTokens(params.messages),
    });
    
    // Return tracking middleware
    return {
      processResponse: async (response: ChatCompletion) => {
        const duration = performance.now() - startTime;
        
        await this.usageRepository.updateUsage({
          tenantId: tenant,
          modelId: model,
          outputTokens: estimateTokens(response.choices[0].message),
          durationMs: duration,
        });
      }
    };
  }
}
```

### 2. Token Counter

The Token Counter provides accurate token counting for different AI models:

```typescript
export function estimateTokens(content: string | object): number {
  // For string content
  if (typeof content === 'string') {
    // Approximate token count (English language approximation)
    return Math.ceil(content.length / 4);
  }
  
  // For message arrays (OpenAI format)
  if (Array.isArray(content)) {
    return content.reduce((sum, item) => {
      if (typeof item === 'object' && item.content) {
        return sum + estimateTokens(item.content);
      }
      return sum;
    }, 0);
  }
  
  // For message objects
  if (typeof content === 'object') {
    if ('content' in content) {
      return estimateTokens(content.content);
    }
    
    // Convert object to JSON string and estimate
    return Math.ceil(JSON.stringify(content).length / 4);
  }
  
  return 0;
}
```

### 3. Usage Repository

The Usage Repository stores and aggregates usage data with tenant isolation:

```typescript
class UsageRepository {
  constructor(
    private prisma: PrismaClient,
    private redisMetricsClient: RedisMetricsClient
  ) {}
  
  async recordRequest(data: UsageRequestData): Promise<void> {
    // Store in database for permanent record
    await this.prisma.userUsage.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        modelId: data.modelId,
        date: new Date(),
        tokenCount: data.inputTokens,
        type: 'INPUT'
      }
    });
    
    // Update real-time metrics in Redis
    await this.redisMetricsClient.incrementCounter(
      `usage.requests.${data.modelId}`, 
      data.tenantId
    );
    
    await this.redisMetricsClient.incrementCounter(
      `usage.tokens.input.${data.modelId}`, 
      data.tenantId, 
      data.inputTokens
    );
  }
  
  async updateUsage(data: UsageResponseData): Promise<void> {
    // Record output token usage
    await this.prisma.userUsage.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        modelId: data.modelId,
        date: new Date(),
        tokenCount: data.outputTokens,
        type: 'OUTPUT'
      }
    });
    
    // Update real-time metrics
    await this.redisMetricsClient.incrementCounter(
      `usage.tokens.output.${data.modelId}`, 
      data.tenantId, 
      data.outputTokens
    );
    
    await this.redisMetricsClient.recordLatency(
      `usage.latency.${data.modelId}`, 
      data.durationMs,
      data.tenantId
    );
    
    // Log to compliance system
    await this.logUsageCompliance(data);
  }
  
  async getTenantUsage(tenantId: string, period: 'day' | 'week' | 'month'): Promise<TenantUsageSummary> {
    // Calculate date range based on period
    const startDate = getStartDateForPeriod(period);
    
    // Get usage from database
    const usage = await this.prisma.userUsage.groupBy({
      by: ['modelId', 'type'],
      where: {
        tenantId,
        date: { gte: startDate }
      },
      _sum: {
        tokenCount: true
      }
    });
    
    // Transform into summary format
    return transformToUsageSummary(usage);
  }
  
  private async logUsageCompliance(data: UsageResponseData): Promise<void> {
    await ComplianceLogger.log({
      eventType: 'usage.recorded',
      resourceId: `${data.tenantId}:${data.modelId}`,
      description: `AI usage recorded: ${data.inputTokens} input + ${data.outputTokens} output tokens`,
      metadata: {
        tenantId: data.tenantId,
        modelId: data.modelId,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        durationMs: data.durationMs,
        estimatedCost: calculateCost(data)
      }
    });
  }
}
```

### 4. Cost Calculator

The Cost Calculator applies model-specific pricing to usage data:

```typescript
export const MODEL_PRICING = {
  'gpt-4o': {
    input: 0.01,    // $10 per 1M input tokens
    output: 0.03    // $30 per 1M output tokens
  },
  'gpt-4-turbo': {
    input: 0.01,
    output: 0.03
  },
  'gpt-3.5-turbo': {
    input: 0.0005,  // $0.50 per 1M input tokens
    output: 0.0015  // $1.50 per 1M output tokens
  },
  'claude-3-opus': {
    input: 0.015,   // $15 per 1M input tokens
    output: 0.075   // $75 per 1M output tokens
  },
  'claude-3-sonnet': {
    input: 0.003,   // $3 per 1M input tokens
    output: 0.015   // $15 per 1M output tokens
  },
  'claude-3-haiku': {
    input: 0.00025, // $0.25 per 1M input tokens
    output: 0.00125 // $1.25 per 1M output tokens
  }
};

export function calculateCost(data: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const pricing = MODEL_PRICING[data.modelId] || {
    input: 0.01,
    output: 0.03
  };
  
  // Calculate cost in dollars
  const inputCost = (data.inputTokens / 1000000) * pricing.input;
  const outputCost = (data.outputTokens / 1000000) * pricing.output;
  
  return inputCost + outputCost;
}
```

### 5. Budget Control System

The Budget Control System enforces usage limits based on subscription tiers:

```typescript
export class BudgetControlService {
  constructor(
    private prisma: PrismaClient,
    private redisClient: Redis
  ) {}
  
  async checkBudget(userId: string, tenantId: string, tokenEstimate: number): Promise<boolean> {
    // Get user's current usage and limits
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Get real-time usage from Redis
    const currentUsage = await this.getCurrentUsage(userId, tenantId);
    const usageLimit = user.usageLimit || user.subscription?.tokenLimit || 50000;
    
    // Check if this request would exceed the limit
    return (currentUsage + tokenEstimate) <= usageLimit;
  }
  
  async getCurrentUsage(userId: string, tenantId: string): Promise<number> {
    const redisKey = `usage:${tenantId}:${userId}:monthly`;
    const cachedUsage = await this.redisClient.get(redisKey);
    
    if (cachedUsage) {
      return parseInt(cachedUsage, 10);
    }
    
    // If not in cache, calculate from database
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usage = await this.prisma.userUsage.aggregate({
      where: {
        userId,
        tenantId,
        date: { gte: startOfMonth }
      },
      _sum: { tokenCount: true }
    });
    
    const totalUsage = usage._sum.tokenCount || 0;
    
    // Cache the result with expiry at end of month
    const ttl = getSecondsUntilEndOfMonth();
    await this.redisClient.set(redisKey, totalUsage.toString(), 'EX', ttl);
    
    return totalUsage;
  }
  
  async incrementUsage(userId: string, tenantId: string, tokenCount: number): Promise<void> {
    const redisKey = `usage:${tenantId}:${userId}:monthly`;
    await this.redisClient.incrby(redisKey, tokenCount);
  }
}
```

## Integration with Compliance Framework

The Usage Tracking System integrates deeply with the Compliance Framework:

### 1. Compliance Logging

All significant usage events are logged to the immutable compliance log:

```typescript
await ComplianceLogger.log({
  eventType: 'usage.limit.exceeded',
  resourceId: userId,
  description: 'User attempted to exceed usage limit',
  metadata: {
    tenantId,
    currentUsage,
    requestedTokens,
    usageLimit
  }
});
```

### 2. Circuit Breakers

Usage tracking uses circuit breakers to handle external service failures:

```typescript
const modelServiceBreaker = getCircuitBreaker('model-service');

try {
  // Execute the external service call through the circuit breaker
  const tokenCount = await modelServiceBreaker.execute(() => 
    modelService.estimateTokens(content)
  );
  
  return tokenCount;
} catch (error) {
  // Circuit is open or call failed
  logger.warn('Token estimation service unavailable, using fallback estimation');
  return fallbackEstimateTokens(content);
}
```

### 3. Metrics Collection

Usage metrics are stored in time-bucketed Redis metrics:

```typescript
// Record usage metrics
await metricsCollector.trackValue(
  'usage.tokens.total', 
  inputTokens + outputTokens,
  {
    model: modelId,
    type: 'completion'
  }
);

// Record p95 latency for model invocations
const p95Latency = await metricsCollector.getPercentileLatency(
  `usage.latency.${modelId}`,
  tenantId,
  95
);
```

## Dashboard Integration

The usage tracking system provides data for operational dashboards:

1. **Tenant Usage Dashboard**: Shows consumption patterns by tenant
2. **Cost Breakdown**: Visualizes costs by model and usage type
3. **Quota Utilization**: Displays current usage against subscription limits
4. **Usage Forecasting**: Projects future costs based on current trends

## Configuration

The usage tracking system is configured through environment variables:

```
# Usage Tracking Configuration
USAGE_TRACKING_ENABLED=true
USAGE_CACHE_TTL_SECONDS=3600
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
ENFORCE_BUDGET_LIMITS=true
```

## Testing

Comprehensive tests verify the usage tracking functionality:

```typescript
test('should track token usage accurately', async () => {
  const interceptor = new OpenAIUsageInterceptor(mockRepository);
  
  const middleware = await interceptor.interceptRequest({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello world' }]
  }, 'test-tenant');
  
  // Check that pre-request tracking happened
  expect(mockRepository.recordRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId: 'test-tenant',
      modelId: 'gpt-4o',
      inputTokens: expect.any(Number)
    })
  );
  
  // Process mock response
  await middleware.processResponse({
    choices: [{ 
      message: { role: 'assistant', content: 'Hello, how can I help you?' }
    }]
  });
  
  // Check that post-request tracking happened
  expect(mockRepository.updateUsage).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId: 'test-tenant',
      modelId: 'gpt-4o',
      outputTokens: expect.any(Number),
      durationMs: expect.any(Number)
    })
  );
});
```

## Best Practices

1. **Real-time Monitoring**: Monitor usage patterns to identify anomalies
2. **Proper Token Estimation**: Use model-specific tokenizers for accurate counting
3. **Graceful Degradation**: Implement fallbacks for when usage tracking fails
4. **Clear Notifications**: Alert users when approaching usage limits
5. **Usage Optimization**: Provide recommendations for reducing token usage

## Future Improvements

1. **Adaptive Quotas**: Dynamically adjust quotas based on historical usage patterns
2. **Cost Optimization**: Suggest model downgrades for appropriate tasks
3. **Budget Forecasting**: Predict future costs based on current usage trends
4. **Usage Analytics**: Provide deeper insights into consumption patterns
5. **Custom Pricing Models**: Support for tenant-specific pricing arrangements