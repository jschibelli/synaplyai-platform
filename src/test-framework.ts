import config from './config';
import { ComplianceLogger } from './compliance/logger';
import { AdaptiveCircuitBreaker } from './circuit-breaker/adaptive-breaker';
import { CircuitState } from './circuit-breaker/interfaces';

/**
 * Framework test script that demonstrates the Enhanced Compliance Framework features
 */
async function testFramework() {
  const {
    redisClient,
    circuitBreakerStore,
    metricsCollector,
    featureFlagService,
    operationalDashboard
  } = config.services;

  // Test tenant
  const tenantId = 'test-tenant-1';
  
  console.log('Testing Enhanced Compliance Framework...');

  // 1. Test Feature Flags
  console.log('\n1. Creating feature flags...');
  
  await featureFlagService.createFlag(
    tenantId,
    'enable-new-dashboard',
    'Enables the new dashboard UI',
    true,
    { $percentage: { value: 50 } }
  );
  // filepath: d:\ai-dev-projects\ai-create-assistant\src\test-framework.ts
import config from './config';
import { ComplianceLogger } from './compliance/logger';
import { AdaptiveCircuitBreaker } from './circuit-breaker/adaptive-breaker';
import { CircuitState } from './circuit-breaker/interfaces';

/**
 * Framework test script that demonstrates the Enhanced Compliance Framework features
 */
async function testFramework() {
  const {
    redisClient,
    circuitBreakerStore,
    metricsCollector,
    featureFlagService,
    operationalDashboard
  } = config.services;

  // Test tenant
  const tenantId = 'test-tenant-1';
  
  console.log('Testing Enhanced Compliance Framework...');

  // 1. Test Feature Flags
  console.log('\n1. Creating feature flags...');
  
  await featureFlagService.createFlag(
    tenantId,
    'enable-new-dashboard',
    'Enables the new dashboard UI',
    true,
    { $percentage: { value: 50 } }
  );
  