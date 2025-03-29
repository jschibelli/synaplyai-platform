import { EventStore, Event } from '../../../src/collaboration/events/EventStore';
import { MetricsCollector } from '../../../src/metrics/collector';
import { PrismaClient } from '@prisma/client';

// Mock Prisma and metrics collector
jest.mock('@prisma/client');
jest.mock('../../../src/metrics/collector');

// Mock tenant context
jest.mock('../../../src/lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ 
    tenantId: 'test-tenant',
    userId: 'test-user' 
  })
}));

describe('EventStore', () => {
  let eventStore: EventStore;
  let prisma: jest.Mocked<PrismaClient>;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    prisma = {
      event: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn()
      }
    } as unknown as jest.Mocked<PrismaClient>;
    
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create EventStore instance
    eventStore = new EventStore(prisma, metricsCollector);
  });
  
  describe('appendEvent', () => {
    test('should store an event with version assignment', async () => {
      // Mock latest event query - no previous events
      prisma.event.findFirst.mockResolvedValueOnce(null);
      
      // Mock event creation
      const mockCreatedEvent = {
        id: 'test-id',
        type: 'TEST_EVENT',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        payload: { data: 'test data' },
        version: 1,
        timestamp: expect.any(Number),
        metadata: { schemaVersion: 1 }
      };
      prisma.event.create.mockResolvedValueOnce(mockCreatedEvent);
      
      // Test event
      const event: Event = {
        type: 'TEST_EVENT',
        documentId: 'doc-1',
        userId: 'test-user',
        payload: { data: 'test data' },
        metadata: {
          schemaVersion: 1
        }
      };
      
      // Store the event
      const result = await eventStore.appendEvent(event);
      
      // Verify correct data was passed to create
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data' },
          version: 1
        })
      });
      
      // Verify returned event
      expect(result).toEqual(mockCreatedEvent);
      
      // Verify metrics were recorded
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'event.store', 
        expect.any(Number)
      );
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'event.stored', 
        1,
        expect.objectContaining({
          eventType: 'TEST_EVENT',
          documentId: 'doc-1'
        })
      );
    });
    
    test('should increment version based on latest event', async () => {
      // Mock latest event query - previous event with version 5
      prisma.event.findFirst.mockResolvedValueOnce({ version: 5 });
      
      // Mock event creation
      const mockCreatedEvent = {
        id: 'test-id',
        type: 'TEST_EVENT',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        payload: { data: 'test data' },
        version: 6,
        timestamp: expect.any(Number),
        metadata: {}
      };
      prisma.event.create.mockResolvedValueOnce(mockCreatedEvent);
      
      // Test event
      const event: Event = {
        type: 'TEST_EVENT',
        documentId: 'doc-1',
        userId: 'test-user',
        payload: { data: 'test data' }
      };
      
      // Store the event
      const result = await eventStore.appendEvent(event);
      
      // Verify new version is incremented
      expect(result.version).toBe(6);
    });
    
    test('should use transaction client when provided', async () => {
      // Mock transaction client
      const transactionClient = {
        event: {
          findFirst: jest.fn().mockResolvedValueOnce(null),
          create: jest.fn().mockResolvedValueOnce({
            id: 'test-id',
            version: 1
          })
        }
      };
      
      // Test event
      const event: Event = {
        type: 'TEST_EVENT',
        documentId: 'doc-1',
        userId: 'test-user',
        payload: { data: 'test data' }
      };
      
      // Store with transaction client
      await eventStore.appendEvent(event, { client: transactionClient });
      
      // Verify transaction client was used instead of prisma
      expect(transactionClient.event.findFirst).toHaveBeenCalled();
      expect(transactionClient.event.create).toHaveBeenCalled();
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
      expect(prisma.event.create).not.toHaveBeenCalled();
    });
  });
  
  describe('replayEvents', () => {
    test('should query and return events for a document', async () => {
      // Mock events
      const mockEvents = [
        {
          id: 'evt-1',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 1' },
          version: 1,
          timestamp: Date.now() - 1000
        },
        {
          id: 'evt-2',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 2' },
          version: 2,
          timestamp: Date.now() - 500
        }
      ];
      
      // Mock findMany to return test events
      prisma.event.findMany.mockResolvedValueOnce(mockEvents);
      
      // Replay events
      const result = await eventStore.replayEvents(
        'doc-1',
        (state, event) => ({ ...state, ...event.data }),
        { content: '', version: 0 }
      );
      
      // Verify query parameters
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          version: { gte: 0 }
        },
        orderBy: {
          version: 'asc'
        }
      });
      
      // Verify returned events
      expect(result).toEqual(mockEvents);
      
      // Verify metrics were recorded
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'event.replay', 
        expect.any(Number)
      );
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'event.replayed', 
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          eventCount: 2
        })
      );
    });
    
    test('should filter events by fromVersion', async () => {
      // Mock events
      const mockEvents = [
        {
          id: 'evt-3',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 3' },
          version: 3,
          timestamp: Date.now() - 300
        }
      ];
      
      // Mock findMany to return test events
      prisma.event.findMany.mockResolvedValueOnce(mockEvents);
      
      // Replay events from version 3
      const result = await eventStore.replayEvents(
        'doc-1',
        (state, event) => ({ ...state, ...event.data }),
        { content: '', version: 0 }
      );
      
      // Verify query parameters include version filter
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          version: { gte: 3 }
        },
        orderBy: {
          version: 'asc'
        }
      });
      
      // Verify returned events
      expect(result).toEqual(mockEvents);
    });
    
    test('should use cached events when available', async () => {
      // First call to cache events
      const mockEvents = [
        {
          id: 'evt-1',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 1' },
          version: 1,
          timestamp: Date.now() - 1000
        },
        {
          id: 'evt-2',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 2' },
          version: 2,
          timestamp: Date.now() - 500
        }
      ];
      
      // Mock findMany for first call
      prisma.event.findMany.mockResolvedValueOnce(mockEvents);
      
      // First call should fetch from DB
      const result1 = await eventStore.replayEvents(
        'doc-1',
        (state, event) => ({ ...state, ...event.data }),
        { content: '', version: 0 }
      );
      expect(result1).toEqual(mockEvents);
      expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const result2 = await eventStore.replayEvents(
        'doc-1',
        (state, event) => ({ ...state, ...event.data }),
        { content: '', version: 0 }
      );
      expect(result2).toEqual(mockEvents);
      
      // Verify DB was not called again
      expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    });
    
    test('should bypass cache when explicitly disabled', async () => {
      // Mock events
      const mockEvents = [
        {
          id: 'evt-1',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 1' },
          version: 1,
          timestamp: Date.now() - 1000
        }
      ];
      
      // Mock findMany to return test events each time
      prisma.event.findMany.mockResolvedValueOnce(mockEvents);
      prisma.event.findMany.mockResolvedValueOnce(mockEvents);
      
      // First call with caching
      await eventStore.replayEvents(
        'doc-1',
        (state, event) => ({ ...state, ...event.data }),
        { content: '', version: 0 }
      );
      
      // Second call with caching disabled
      await eventStore.replayEvents(
        'doc-1',
        (state, event) => ({ ...state, ...event.data }),
        { content: '', version: 0 },
        { useCache: false }
      );
      
      // Verify DB was called twice
      expect(prisma.event.findMany).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('getEventsBeforeTime', () => {
    test('should return events before specified timestamp', async () => {
      // Mock events
      const mockEvents = [
        {
          id: 'evt-1',
          type: 'TEST_EVENT',
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          payload: { data: 'test data 1' },
          version: 1,
          timestamp: 1000
        }
      ];
      
      // Mock findMany
      prisma.event.findMany.mockResolvedValueOnce(mockEvents);
      
      // Get events before timestamp
      const timestamp = 2000;
      const result = await eventStore.getEventsBeforeTime('doc-1', timestamp);
      
      // Verify query parameters
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          timestamp: { lte: timestamp }
        },
        orderBy: {
          version: 'asc'
        }
      });
      
      // Verify returned events
      expect(result).toEqual(mockEvents);
    });
  });
  
  describe('getEventCount', () => {
    test('should return count of events for a document', async () => {
      // Mock count
      prisma.event.count.mockResolvedValueOnce(5);
      
      // Get event count
      const count = await eventStore.getEventCount('doc-1');
      
      // Verify query parameters
      expect(prisma.event.count).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'test-tenant'
        }
      });
      
      // Verify returned count
      expect(count).toBe(5);
    });
  });
});