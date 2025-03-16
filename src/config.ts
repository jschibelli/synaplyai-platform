import { ShardedRedisClient } from './metrics/sharded-redis';
import { RedisCircuitBreakerStore } from './circuit-breaker/redis-store';
import { FeatureFlagService } from './features/flag-service';
import { OperationalDashboard } from './dashboard/operational-dashboard';
import { MetricsCollector } from './metrics/collector';
import { EnhancedFilterPipeline } from './filtering/filter-pipeline';
import { PartitionManager } from './compliance/partition-manager';

// Environment configuration
const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';

// Redis configuration
const redisUrls = isProduction
  ? [
      process.env.REDIS_URL_1 || 'redis://redis-1:6379',
      process.env.REDIS_URL_2 || 'redis://redis-2:6379',
      process.env.REDIS_URL_3 || 'redis://redis-3:6379'
    ]
  : ['redis://localhost:6379'];

// Initialize shared services
const shardedRedisClient = new ShardedRedisClient(redisUrls);
const circuitBreakerStore = new RedisCircuitBreakerStore(redisUrls[0]);
const metricsCollector = new MetricsCollector(shardedRedisClient);

// Initialize feature flag service
const featureFlagService = new FeatureFlagService(shardedRedisClient);

// Initialize operational dashboard
const operationalDashboard = new OperationalDashboard(
  shardedRedisClient, 
  circuitBreakerStore,
  featureFlagService
);

// Initialize content filter pipeline
const contentFilterPipeline = new EnhancedFilterPipeline(metricsCollector);

// Initialize partition manager for compliance logs
if (isProduction) {
  PartitionManager.schedulePartitionCreation();
}

// Application configuration
const config = {
  environment,
  isProduction,
  services: {
    redisClient: shardedRedisClient,
    circuitBreakerStore,
    metricsCollector,
    featureFlagService,
    operationalDashboard,
    contentFilterPipeline
  },
  settings: {
    logRotationDays: 90,
    defaultCircuitBreakerTimeout: 30000,
    metricsAggregationInterval: 60000,
    dashboardRefreshIntervalMs: 5000,
  }
};

export default config;