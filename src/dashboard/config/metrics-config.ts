// Add new file: src/dashboard/config/metrics-config.ts
export const dashboardConfig = {
  metrics: {
    latency: {
      warning: 1000,    // 1 second
      critical: 2000,   // 2 seconds
      buckets: [50, 75, 90, 95, 99]  // Percentiles to track
    },
    redis: {
      memoryWarning: 0.8,  // 80% memory usage
      memoryCritical: 0.9, // 90% memory usage
      keyspaceWarning: 1000000  // Number of keys
    },
    circuit: {
      errorRateWarning: 0.05,  // 5% error rate
      errorRateCritical: 0.10, // 10% error rate
      recoveryWindow: 300000   // 5 minutes
    }
  },
  alerts: {
    channels: ['slack', 'email'],
    throttle: 300,  // 5 minutes between similar alerts
    templates: {
      latencyAlert: 'P95 latency exceeded {threshold}ms for {operation}',
      circuitBreaker: 'Circuit breaker opened for {service} due to {reason}'
    }
  }
};