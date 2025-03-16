# Usage Tracking System

## Overview
The usage tracking system provides real-time token counting and budget controls for the AI platform. It uses Redis for real-time tracking and includes fallback mechanisms for reliability.

## Components

### 1. UsageTracker
- Real-time token counting
- Redis-based storage
- Circuit breaker pattern
- In-memory fallback cache

```typescript
const usageTracker = new UsageTracker(subscriptionManager);
await usageTracker.trackTokenUsage(tenantId, modelId, tokens);