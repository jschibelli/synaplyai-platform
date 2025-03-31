// Remove the problematic import and define an interface instead.
import { jest } from '@jest/globals';

interface MetricsCollector {
  increment: Function;
  recordLatency: Function;
  recordValue: Function;
  track: Function;
  incrementCounter: Function;
  getAverageValue: Function;
  getPercentileLatency: Function;
  trackEvent: Function;
  trackMetric: Function;
  recordTokenUsage: Function;
  flush: Function;
  getMetrics: Function;
}

// Create a complete mock that matches the interface
const mockMetricsCollector = {
  increment: jest.fn(),
  recordLatency: jest.fn(),
  recordValue: jest.fn(),
  track: jest.fn(),
  incrementCounter: jest.fn(),
  getAverageValue: jest.fn().mockReturnValue(0),
  getPercentileLatency: jest.fn().mockReturnValue(0),
  trackEvent: jest.fn(),
  trackMetric: jest.fn(),
  recordTokenUsage: jest.fn(),
  // Fix the mockResolvedValue issue by using mockImplementation
  flush: jest.fn().mockImplementation(() => Promise.resolve()),
  getMetrics: jest.fn().mockReturnValue({
    requestCount: 0,
    tokenCount: 0,
    errorCount: 0,
    avgLatency: 0
  })
};

// Add the mockResolvedValue methods
Object.keys(mockMetricsCollector).forEach(key => {
  if (typeof mockMetricsCollector[key] === 'function') {
    mockMetricsCollector[key].mockResolvedValue = function(value) {
      return this.mockImplementation(() => Promise.resolve(value));
    };
    
    mockMetricsCollector[key].mockResolvedValueOnce = function(value) {
      return this.mockImplementationOnce(() => Promise.resolve(value));
    };
    
    mockMetricsCollector[key].mockRejectedValue = function(error) {
      return this.mockImplementation(() => Promise.reject(error));
    };
  }
});

// Export with proper type casting that preserves both MetricsCollector interface and Jest mock methods
export default mockMetricsCollector as unknown as jest.Mocked<MetricsCollector>;

/**
 * Factory function to create metrics collector mocks
 */
export function createMetricsCollectorMock() {
  return {
    trackEvent: jest.fn(),
    trackMetric: jest.fn(),
    incrementCounter: jest.fn(),
    recordLatency: jest.fn(),
    recordTokenUsage: jest.fn(),
    // Fix the mockResolvedValue issue by using mockImplementation
    flush: jest.fn().mockImplementation(() => Promise.resolve()),
    getMetrics: jest.fn().mockReturnValue({
      requestCount: 0,
      tokenCount: 0,
      errorCount: 0,
      avgLatency: 0
    })
  };
}

// Create a pre-initialized instance that can be imported directly
export const metricsCollectorMock = createMetricsCollectorMock();