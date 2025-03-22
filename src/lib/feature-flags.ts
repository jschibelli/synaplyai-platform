import { ShardedRedisClient } from '../redis/sharded-redis-client';

export class FeatureFlagService {
  private redisClient: ShardedRedisClient;
  private cacheTTLSeconds: number;

  constructor(redisClient: ShardedRedisClient, cacheTTLSeconds = 300) {
    this.redisClient = redisClient;
    this.cacheTTLSeconds = cacheTTLSeconds;
  }

  async isEnabled(tenantId: string, flagName: string, context: Record<string, any> = {}): Promise<boolean> {
    const cacheKey = `feature-flag:${tenantId}:${flagName}`;
    const shard = this.redisClient.getShardForTenant(tenantId);

    // Try to get from cache first
    const cachedFlag = await shard.get(cacheKey);

    if (cachedFlag) {
      const flag = JSON.parse(cachedFlag);

      // If flag is disabled, return false immediately
      if (!flag.enabled) {
        return false;
      }

      // If there are conditions, evaluate them
      if (flag.conditions) {
        return this.evaluateConditions(flag.conditions, context);
      }

      return true;
    }

    // Fetch from database if not in cache
    const flag = await this.fetchFlagFromDatabase(tenantId, flagName);

    // Cache the result
    if (flag) {
      await shard.set(cacheKey, JSON.stringify(flag), 'EX', this.cacheTTLSeconds);
    }

    return flag ? flag.enabled : false;
  }

  private async fetchFlagFromDatabase(tenantId: string, flagName: string): Promise<any> {
    // Simulate database fetch
    // Replace with actual database call in production
    return {
      tenantId,
      name: flagName,
      enabled: true,
      conditions: null
    };
  }

  private evaluateConditions(conditions: Record<string, any>, context: Record<string, any>): boolean {
    // Implementation of a basic condition evaluator
    // In a real system, this would be more sophisticated

    // AND condition - all must be true
    if (conditions.$and && Array.isArray(conditions.$and)) {
      return conditions.$and.every(subCondition => 
        this.evaluateConditions(subCondition, context)
      );
    }

    // OR condition - at least one must be true
    if (conditions.$or && Array.isArray(conditions.$or)) {
      return conditions.$or.some(subCondition => 
        this.evaluateConditions(subCondition, context)
      );
    }

    // NOT condition - invert result
    if (conditions.$not) {
      return !this.evaluateConditions(conditions.$not, context);
    }

    // User percentage rollout
    if (conditions.$percentage && typeof conditions.$percentage.value === 'number') {
      const userId = context.userId || '';
      if (!userId) return false;

      const percentage = conditions.$percentage.value;
      const hash = this.hashString(userId) % 100;
      return hash < percentage;
    }

    // Simple property match
    for (const [key, value] of Object.entries(conditions)) {
      if (key.startsWith('$')) continue; // Skip special operators

      // Handle existence check
      if (value === '$exists') {
        if (context[key] === undefined) return false;
        continue;
      }

      // Handle array contains
      if (Array.isArray(value) && value[0] === '$contains' && Array.isArray(context[key])) {
        if (!context[key].includes(value[1])) return false;
        continue;
      }

      // Handle regexp
      if (typeof value === 'string' && value.startsWith('$regex:')) {
        const regexStr = value.substring(7);
        const regex = new RegExp(regexStr);
        if (!regex.test(context[key])) return false;
        continue;
      }

      // Handle comparison operators
      if (typeof value === 'object' && value !== null) {
        if (value.$gt !== undefined && !(context[key] > value.$gt)) return false;
        if (value.$gte !== undefined && !(context[key] >= value.$gte)) return false;
        if (value.$lt !== undefined && !(context[key] < value.$lt)) return false;
        if (value.$lte !== undefined && !(context[key] <= value.$lte)) return false;
        if (value.$ne !== undefined && context[key] === value.$ne) return false;
        continue;
      }

      // Simple equality check
      if (context[key] !== value) return false;
    }

    return true;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}