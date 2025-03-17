import { CommandAggregator } from '../../src/collaboration/commands/CommandAggregator';
import { MetricsCollector } from '../../src/metrics/collector';
import { TenantContext } from '../../src/lib/tenant-context';

// Mock metrics collector
const mockMetricsCollector: jest.Mocked<MetricsCollector> = {
  track: jest.fn(),
  increment: jest.fn(),
  recordLatency: jest.fn(),
  // Add other required methods
} as any;

// Mock tenant context
jest.mock('../../src/lib/tenant-context', () => {
  let currentContext: TenantContext | null = null;
  return {
    getTenantContext: jest.fn(() => currentContext),
    setTenantContext: jest.fn((ctx: TenantContext) => { currentContext = ctx; }),
    clearTenantContext: jest.fn(() => { currentContext = null; }),
  };
});

const { getTenantContext, setTenantContext, clearTenantContext } = require('../../src/lib/tenant-context');

describe('CommandAggregator', () => {
  let aggregator: CommandAggregator;
  
  beforeEach(() => {
    jest.clearAllMocks();
    clearTenantContext();
    
    // Set up tenant context for tests
    setTenantContext({
      tenantId: 'test-tenant',
      userId: 'test-user'
    });
    
    aggregator = new CommandAggregator(mockMetricsCollector);
  });
  
  afterEach(() => {
    clearTenantContext();
  });

  // Test cases will go here
  test('should merge typing commands', async () => {
    // Mock implementation
    jest.spyOn(aggregator as any, 'executeCommand').mockResolvedValue(undefined);
    
    // Buffer typing commands
    await aggregator.bufferCommand({
      type: 'INSERT_TEXT',
      documentId: 'doc-1',
      text: 'H',
      position: 0
    });
    
    await aggregator.bufferCommand({
      type: 'INSERT_TEXT',
      documentId: 'doc-1',
      text: 'e',
      position: 1
    });
    
    await aggregator.bufferCommand({
      type: 'INSERT_TEXT',
      documentId: 'doc-1',
      text: 'l',
      position: 2
    });
    
    // Force flush
    await aggregator.flushAll();
    
    // Verify merged command
    expect((aggregator as any).executeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        text: 'Hel',
        position: 0
      })
    );
    
    // Verify we only executed one command instead of three
    expect((aggregator as any).executeCommand).toHaveBeenCalledTimes(1);
  });
});