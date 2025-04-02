/**
 * Re-export from root __mocks__ directory
 * This file ensures backward compatibility while maintaining a single source of truth
 */
// Re-export from root mocks
export * from '../../src/__mocks__/metrics-collector.mock';
export { default } from '../../src/__mocks__/metrics-collector.mock';
