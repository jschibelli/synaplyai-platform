class AllowanceCheckService {
  constructor(private subscriptionManager: SubscriptionManager, private redisClient: RedisClient) {}

  async checkAllowance(tenantId: string, estimatedTokens: number): Promise<boolean> {
    const subscription = await this.subscriptionManager.getActiveSubscription(tenantId);
    
    const today = formatDate(new Date());
    const month = formatMonth(new Date());

    const dailyUsage = await this.redisClient.hget(`usage:daily:${tenantId}:${today}`, 'total:request') || 0;
    const monthlyUsage = await this.redisClient.hget(`usage:monthly:${tenantId}:${month}`, 'total:request') || 0;

    if (dailyUsage + estimatedTokens > subscription.maxDailyTokens) {
      return false; // Daily limit exceeded
    }

    if (monthlyUsage + estimatedTokens > subscription.maxMonthlyTokens) {
      return false; // Monthly limit exceeded
    }

    return true;
  }
}