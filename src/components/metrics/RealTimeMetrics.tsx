import React, { useEffect, useState } from 'react';
import { TokenCounter } from './TokenCounter';
import { RateLimitIndicator } from './RateLimitIndicator';
import { ThresholdWarning } from './ThresholdWarning';
import { useTenantContext } from '../../hooks/useTenantContext';

interface MetricsData {
  currentTokens: number;
  rateLimit: {
    remaining: number;
    total: number;
    resetAt: string;
  };
  thresholds: {
    warning: number;
    critical: number;
    current: number;
  };
}

export const RealTimeMetrics: React.FC = () => {
  const { tenantId } = useTenantContext();
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`/api/metrics/realtime?tenantId=${tenantId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }
        const data = await response.json();
        setMetrics(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      }
    };

    // Initial fetch
    fetchMetrics();

    // Set up polling interval
    const intervalId = setInterval(fetchMetrics, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [tenantId]);

  if (error) {
    return (
      <div className="real-time-metrics error">
        <p>Error loading metrics: {error}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="real-time-metrics loading">
        <p>Loading metrics...</p>
      </div>
    );
  }

  return (
    <div className="real-time-metrics">
      <div className="metrics-grid">
        <TokenCounter 
          current={metrics.currentTokens} 
          className="metric-card"
        />
        <RateLimitIndicator 
          {...metrics.rateLimit}
          className="metric-card"
        />
        <ThresholdWarning 
          {...metrics.thresholds}
          className="metric-card"
        />
      </div>
    </div>
  );
};