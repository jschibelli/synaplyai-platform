import { getTenantContext } from '../lib/tenantContext';
import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * Interface for usage repository
 */
export interface UsageRepository {
  getUsage(tenantId: string, period: string): Promise<number>;
  incrementUsage(tenantId: string, period: string, amount: number): Promise<void>;
}

/**
 * Interface for subscription repository
 */
export interface SubscriptionRepository {
  getTokenLimit(tenantId: string): Promise<number>;
}

/**
 * Token limiter controls AI token usage and enforces limits
 */
export class TokenLimiter {
  constructor(
    private usageRepository: UsageRepository,
    private subscriptionRepository: SubscriptionRepository,
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Check if tenant has enough tokens and reserve them
   */
  async checkAndReserveTokens(tenantId: string, tokenAmount: number): Promise<void> {
    // Get the current period (e.g., "2025-03")
    const currentPeriod = this.getCurrentPeriod();
    
    // Get tenant's limit
    const tokenLimit = await this.subscriptionRepository.getTokenLimit(tenantId);
    
    // Get tenant's current usage
    const currentUsage = await this.usageRepository.getUsage(tenantId, currentPeriod);
    
    // Check if adding these tokens would exceed limit
    if (currentUsage + tokenAmount > tokenLimit) {
      // Record the limit exceeded event
      this.metricsCollector.incrementCounter('token.limit.exceeded', {
        tenantId,
        period: currentPeriod,
        requested: tokenAmount,
        remaining: tokenLimit - currentUsage
      });
      
      throw new Error('Token usage limit exceeded for this tenant');
    }
    
    // Reserve the tokens by incrementing usage
    await this.usageRepository.incrementUsage(tenantId, currentPeriod, tokenAmount);
    
    // Record successful reservation
    this.metricsCollector.incrementCounter('token.reserved', {
      tenantId,
      period: currentPeriod,
      amount: tokenAmount
    });
    
    // Record remaining tokens as a gauge
    this.metricsCollector.recordValue('token.remaining', tokenLimit - currentUsage - tokenAmount, {
      tenantId,
      period: currentPeriod
    });
  }
  
  /**
   * Get the current period in YYYY-MM format
   */
  private getCurrentPeriod(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}