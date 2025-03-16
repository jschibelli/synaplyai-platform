import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { RedisClient } from '../metrics/redis-client';

config();

interface FeatureFlags {
    ENABLE_ADVANCED_FILTERING: boolean;
    ENABLE_EMBEDDING_CHECKS: boolean;
    ENABLE_LLM_CHECKS: boolean;
}

export class FeatureFlagService {
    private flags: FeatureFlags;
    private static readonly CACHE_TTL = 300; // 5 minutes
    private cache: Map<string, { value: boolean; expires: number }> = new Map();

    constructor(private redis: Redis) {
        this.flags = {
            ENABLE_ADVANCED_FILTERING: this.getFlag('ENABLE_ADVANCED_FILTERING'),
            ENABLE_EMBEDDING_CHECKS: this.getFlag('ENABLE_EMBEDDING_CHECKS'),
            ENABLE_LLM_CHECKS: this.getFlag('ENABLE_LLM_CHECKS'),
        };
    }

    private getFlag(flagName: string): boolean {
        return process.env[flagName] === 'true';
    }

    public isFeatureEnabled(flagName: keyof FeatureFlags): boolean {
        return this.flags[flagName];
    }

    async isFeatureEnabled(tenantId: string, feature: string): Promise<boolean> {
        const cacheKey = `${tenantId}:${feature}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            return cached.value;
        }

        try {
            const value = await this.redis.hget(`tenant:${tenantId}:flags`, feature);
            const enabled = value === 'true';

            this.cache.set(cacheKey, {
                value: enabled,
                expires: Date.now() + FeatureFlagService.CACHE_TTL * 1000
            });

            return enabled;
        } catch (error) {
            // Fall back to defaults if Redis is unavailable
            return this.getDefaultValue(feature);
        }
    }

    private getDefaultValue(feature: string): boolean {
        const defaults: Record<string, boolean> = {
            'ENABLE_ADVANCED_FILTERING': false,
            'ENABLE_EMBEDDING_CHECKS': false,
            'ENABLE_LLM_CHECKS': false
        };
        return defaults[feature] ?? false;
    }

    async isEnabled(flagName: string, tenantId: string): Promise<boolean> {
        // Check tenant-specific override
        const tenantFlag = await this.redis.get(`feature:${flagName}:tenant:${tenantId}`);
        if (tenantFlag !== null) {
            return tenantFlag === 'true';
        }
        
        // Fallback to global flag
        const globalFlag = await this.redis.get(`feature:${flagName}:global`);
        return globalFlag === 'true';
    }
    
    async setFlag(flagName: string, enabled: boolean, tenantId?: string): Promise<void> {
        const key = tenantId 
            ? `feature:${flagName}:tenant:${tenantId}` 
            : `feature:${flagName}:global`;
            
        await this.redis.set(key, enabled.toString());
    }
    
    async deleteFlag(flagName: string, tenantId?: string): Promise<void> {
        const key = tenantId 
            ? `feature:${flagName}:tenant:${tenantId}` 
            : `feature:${flagName}:global`;
            
        await this.redis.del(key);
    }
    
    async getAllFlags(tenantId?: string): Promise<Record<string, boolean>> {
        const result: Record<string, boolean> = {};
        
        // Get global flags
        const globalKeys = await this.redis.keys('feature:*:global');
        for (const key of globalKeys) {
            const flagName = key.split(':')[1];
            const value = await this.redis.get(key);
            result[flagName] = value === 'true';
        }
        
        // Override with tenant-specific flags if provided
        if (tenantId) {
            const tenantKeys = await this.redis.keys(`feature:*:tenant:${tenantId}`);
            for (const key of tenantKeys) {
                const flagName = key.split(':')[1];
                const value = await this.redis.get(key);
                result[flagName] = value === 'true';
            }
        }
        
        return result;
    }
}