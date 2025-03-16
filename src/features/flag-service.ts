import { ShardedRedisClient } from '../metrics/sharded-redis';
import { prisma } from '../lib/prisma';
import { ComplianceLogger } from '../compliance/logger';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tenantId: string;
  conditions?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class FeatureFlagService {
  private redisClient: ShardedRedisClient;
  private cacheTTLSeconds: number;
  
  constructor(redisClient: ShardedRedisClient, cacheTTLSeconds = 300) {
    this.redisClient = redisClient;
    this.cacheTTLSeconds = cacheTTLSeconds;
  }
  
  /**
   * Check if a feature flag is enabled for a specific tenant
   */
  async isEnabled(tenantId: string, flagName: string, context?: Record<string, any>): Promise<boolean> {
    // Try to get from cache first for performance
    const cacheKey = `feature-flag:${tenantId}:${flagName}`;
    const shard = this.redisClient.getShardForTenant(tenantId);
    const cachedFlag = await shard.get(cacheKey);
    
    let flag;
    if (cachedFlag) {
      // Use cached value if available
      flag = JSON.parse(cachedFlag);
    } else {
      // Fetch from database if not in cache
      flag = await prisma.featureFlag.findFirst({
        where: {
          tenantId,
          name: flagName
        }
      });
      
      // Cache the result
      if (flag) {
        await shard.set(cacheKey, JSON.stringify(flag), { EX: this.cacheTTLSeconds });
      }
    }
    
    // If flag doesn't exist, it's disabled by default
    if (!flag) {
      return false;
    }
    
    // Check basic enabled status
    if (!flag.enabled) {
      return false;
    }
    
    // If there are conditions, evaluate them
    if (flag.conditions && Object.keys(flag.conditions).length > 0) {
      return this.evaluateConditions(flag.conditions, context || {});
    }
    
    // No conditions, just return the enabled status
    return flag.enabled;
  }
  
  /**
   * Create a new feature flag
   */
  async createFlag(
    tenantId: string,
    name: string,
    description: string,
    enabled: boolean,
    conditions?: Record<string, any>
  ): Promise<FeatureFlag> {
    // Check if flag already exists
    const existingFlag = await prisma.featureFlag.findFirst({
      where: {
        tenantId,
        name
      }
    });
    
    if (existingFlag) {
      throw new Error(`Feature flag '${name}' already exists for tenant '${tenantId}'`);
    }
    
    // Create the flag
    const flag = await prisma.featureFlag.create({
      data: {
        tenantId,
        name,
        description,
        enabled,
        conditions: conditions ? JSON.stringify(conditions) : null
      }
    });
    
    // Cache the new flag
    const cacheKey = `feature-flag:${tenantId}:${name}`;
    const shard = this.redisClient.getShardForTenant(tenantId);
    await shard.set(cacheKey, JSON.stringify(flag), { EX: this.cacheTTLSeconds });
    
    // Log the creation
    await ComplianceLogger.log({
      eventType: 'feature.flag.created',
      resourceId: name,
      description: `Feature flag '${name}' created`,
      metadata: {
        tenantId,
        enabled,
        conditions
      }
    });
    
    return flag;
  }
  
  /**
   * Update an existing feature flag
   */
  async updateFlag(
    tenantId: string,
    name: string,
    updates: {
      description?: string;
      enabled?: boolean;
      conditions?: Record<string, any>;
    }
  ): Promise<FeatureFlag> {
    // Get the flag
    const flag = await prisma.featureFlag.findFirst({
      where: {
        tenantId,
        name
      }
    });
    
    if (!flag) {
      throw new Error(`Feature flag '${name}' not found for tenant '${tenantId}'`);
    }
    
    // Update the flag
    const updatedFlag = await prisma.featureFlag.update({
      where: {
        id: flag.id
      },
      data: {
        description: updates.description !== undefined ? updates.description : flag.description,
        enabled: updates.enabled !== undefined ? updates.enabled : flag.enabled,
        conditions: updates.conditions !== undefined ? JSON.stringify(updates.conditions) : flag.conditions,
        updatedAt: new Date()
      }
    });
    
    // Update the cache
    const cacheKey = `feature-flag:${tenantId}:${name}`;
    const shard = this.redisClient.getShardForTenant(tenantId);
    await shard.set(cacheKey, JSON.stringify(updatedFlag), { EX: this.cacheTTLSeconds });
    
    // Log the update
    await ComplianceLogger.log({
      eventType: 'feature.flag.updated',
      resourceId: name,
      description: `Feature flag '${name}' updated`,
      metadata: {
        tenantId,
        updates,
        previousState: {
          enabled: flag.enabled,
          conditions: flag.conditions ? JSON.parse(flag.conditions as string) : null
        }
      }
    });
    
    return updatedFlag;
  }
  
  /**
   * Delete a feature flag
   */
  async deleteFlag(tenantId: string, name: string): Promise<void> {
    // Get the flag
    const flag = await prisma.featureFlag.findFirst({
      where: {
        tenantId,
        name
      }
    });
    
    if (!flag) {
      throw new Error(`Feature flag '${name}' not found for tenant '${tenantId}'`);
    }
    
    // Delete the flag
    await prisma.featureFlag.delete({
      where: {
        id: flag.id
      }
    });
    
    // Remove from cache
    const cacheKey = `feature-flag:${tenantId}:${name}`;
    const shard = this.redisClient.getShardForTenant(tenantId);
    await shard.del(cacheKey);
    
    // Log the deletion
    await ComplianceLogger.log({
      eventType: 'feature.flag.deleted',
      resourceId: name,
      description: `Feature flag '${name}' deleted`,
      metadata: {
        tenantId,
        previousState: {
          enabled: flag.enabled,
          conditions: flag.conditions ? JSON.parse(flag.conditions as string) : null
        }
      }
    });
  }
  
  /**
   * Get all feature flags for a tenant
   */
  async getAllFlags(tenantId: string): Promise<FeatureFlag[]> {
    const flags = await prisma.featureFlag.findMany({
      where: {
        tenantId
      }
    });
    
    return flags.map(flag => ({
      ...flag,
      conditions: flag.conditions ? JSON.parse(flag.conditions as string) : undefined
    }));
  }
  
  /**
   * Clear the cache for a specific flag
   */
  async clearCache(tenantId: string, flagName: string): Promise<void> {
    const cacheKey = `feature-flag:${tenantId}:${flagName}`;
    const shard = this.redisClient.getShardForTenant(tenantId);
    await shard.del(cacheKey);
  }
  
  /**
   * Clear all cached flags for a tenant
   */
  async clearAllCache(tenantId: string): Promise<void> {
    const flags = await this.getAllFlags(tenantId);
    const shard = this.redisClient.getShardForTenant(tenantId);
    
    for (const flag of flags) {
      const cacheKey = `feature-flag:${tenantId}:${flag.name}`;
      await shard.del(cacheKey);
    }
  }
  
  /**
   * Evaluate conditions against the provided context
   */
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
  
  /**
   * Simple string hash function for percentage-based rollouts
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}