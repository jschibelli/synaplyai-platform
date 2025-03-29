import { ConflictResolver, ConflictType, ConflictResolutionStrategy, ConflictResolutionResult } from '../../../src/collaboration/conflict/ConflictResolver';
import { ConflictDetector } from '../../../src/collaboration/conflict/ConflictDetector';
import { OperationalTransform } from '../../../src/collaboration/conflict/OperationalTransform';
import { VectorClock } from '../../../src/collaboration/conflict/VectorClock';
import { MetricsCollector } from '../../../src/metrics/collector';
import { EventStore } from '../../../src/collaboration/events/EventStore';
import { BaseEvent } from '../../../src/collaboration/events/types';
import { getTenantContext, setTenantContext, clearTenantContext } from '../../../src/lib/tenant-context';
import { createTestConflict } from '../../tests/helpers/test-adapters';

// Mock dependencies
jest.mock('../../../src/metrics/collector');
jest.mock('../../../src/collaboration/events/EventStore');
jest.mock('../../../src/lib/tenant-context');
jest.mock('../../../src/compliance/logger', () => ({
  ComplianceLogger: {
    log: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;
  let detector: ConflictDetector;
  let transform: OperationalTransform;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  let eventStore: jest.Mocked<EventStore>;
  
  beforeEach(() => {
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
      incrementCounter: jest.fn().mockResolvedValue(undefined),
      recordValue: jest.fn().mockResolvedValue(undefined),
      getCounter: jest.fn().mockResolvedValue(5),
      getAverageValue: jest.fn().mockResolvedValue(42)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    eventStore = {
      appendEvent: jest.fn().mockResolvedValue({}),
      getEvents: jest.fn().mockResolvedValue([]),
      getEventCountSinceVersion: jest.fn().mockResolvedValue(0)
    } as unknown as jest.Mocked<EventStore>;
    
    // Mock tenant context
    (getTenantContext as jest.Mock).mockReturnValue({
      tenantId: 'test-tenant',
      userId: 'test-user',
      requestId: 'test-request'
    });
    
    detector = new ConflictDetector(metricsCollector);
    transform = new OperationalTransform();
    resolver = new ConflictResolver(eventStore, metricsCollector, 'test-node');
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('detectConflicts', () => {
    test('should detect TEXT_EDIT conflicts between concurrent inserts at same position', async () => {
      // Create two events with concurrent vector clocks
      const localEvent = {
        id: 'event-1',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        payload: {
          position: 5,
          text: 'Hello'
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      const remoteEvent = {
        id: 'event-2',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-2',
        payload: {
          position: 5,
          text: 'World'
        },
        vectorClock: { user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      // Detect conflicts
      const conflicts = await resolver.detectConflicts(localEvent, [remoteEvent]);
      
      // Verify conflict detection
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.TEXT_EDIT);
      expect(conflicts[0].local).toBe(localEvent);
      expect(conflicts[0].remote).toBe(remoteEvent);
      
      // Verify metrics were recorded
      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        'conflicts.detected',
        expect.any(Object)
      );
    });
    
    test('should detect FORMAT conflicts when the same attributes are changed', async () => {
      // Create two events with concurrent vector clocks
      const localEvent = {
        id: 'event-1',
        type: 'FORMAT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        payload: {
          position: 0,
          length: 10,
          attributes: { bold: true }
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      const remoteEvent = {
        id: 'event-2',
        type: 'FORMAT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-2',
        payload: {
          position: 0,
          length: 10,
          attributes: { bold: false }
        },
        vectorClock: { user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      // Detect conflicts
      const conflicts = await resolver.detectConflicts(localEvent, [remoteEvent]);
      
      // Verify conflict detection
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.FORMAT);
    });
    
    test('should not detect FORMAT conflict when different attributes are changed', async () => {
      // Create two events with concurrent vector clocks but different attributes
      const localEvent = {
        id: 'event-1',
        type: 'FORMAT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        payload: {
          position: 0,
          length: 10,
          attributes: { bold: true }
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      const remoteEvent = {
        id: 'event-2',
        type: 'FORMAT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-2',
        payload: {
          position: 0,
          length: 10,
          attributes: { italic: true }
        },
        vectorClock: { user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      // Detect conflicts
      const conflicts = await resolver.detectConflicts(localEvent, [remoteEvent]);
      
      // Verify no conflicts detected due to different attributes
      expect(conflicts).toHaveLength(0);
    });
    
    test('should not detect conflict when operations are on different regions', async () => {
      // Create two events with concurrent vector clocks but different regions
      const localEvent = {
        id: 'event-1',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        payload: {
          position: 0,
          text: 'Hello'
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      const remoteEvent = {
        id: 'event-2',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-2',
        payload: {
          position: 100,
          text: 'World'
        },
        vectorClock: { user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      // Detect conflicts
      const conflicts = await resolver.detectConflicts(localEvent, [remoteEvent]);
      
      // Verify no conflict detected
      expect(conflicts).toHaveLength(0);
    });
    
    test('should detect DELETE_MODIFIED conflict when content is deleted and modified concurrently', async () => {
      const localEvent = {
        id: 'event-1',
        type: 'DELETE_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        payload: {
          position: 5,
          length: 10
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      const remoteEvent = {
        id: 'event-2',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-2',
        payload: {
          position: 7,
          text: 'World'
        },
        vectorClock: { user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      // Detect conflicts
      const conflicts = await resolver.detectConflicts(localEvent, [remoteEvent]);
      
      // Verify conflict detection
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.DELETE_MODIFIED);
    });
    
    test('should not detect conflict when events have causal relationship', async () => {
      // Create two events with causal relationship
      const localEvent = {
        id: 'event-1',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        payload: {
          position: 5,
          text: 'Hello'
        },
        vectorClock: { user1: 1, user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      const remoteEvent = {
        id: 'event-2',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-2',
        payload: {
          position: 10,
          text: 'World'
        },
        vectorClock: { user2: 1 },
        timestamp: new Date().toISOString()
      } as BaseEvent;
      
      // Detect conflicts
      const conflicts = await resolver.detectConflicts(localEvent, [remoteEvent]);
      
      // Verify no conflict detected due to causality
      expect(conflicts).toHaveLength(0);
    });
  });
  
  describe('resolveConflict', () => {
    test('should resolve TEXT_EDIT conflicts using MERGE strategy', async () => {
      // Create conflict
      const conflict = createTestConflict({
        type: ConflictType.TEXT_EDIT,
        local: {
          id: 'event-1',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-1',
          payload: {
            position: 5,
            text: 'Hello'
          },
          vectorClock: { user1: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        remote: {
          id: 'event-2',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-2',
          payload: {
            position: 5,
            text: 'World'
          },
          vectorClock: { user2: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        localRegion: { start: 5, end: 10 },
        remoteRegion: { start: 5, end: 10 }
      });
      
      // Resolve conflict with MERGE strategy
      const resolution = await resolver.resolveConflict(
        conflict, 
        ConflictResolutionStrategy.MERGE
      );
      
      // Verify merge resolution
      expect(resolution.result).toBe(ConflictResolutionResult.MERGED);
      expect(resolution.resolvedEvent).toBeDefined();
      expect(resolution.resolvedEvent!.payload.text).toBeDefined();
      
      // Verify metrics were recorded
      expect(metricsCollector.recordValue).toHaveBeenCalledWith(
        'conflict.resolution.timeMs',
        expect.any(Number),
        expect.any(Object)
      );
    });
    
    test('should resolve FORMAT conflicts by merging non-conflicting attributes', async () => {
      // Create conflict
      const conflict = createTestConflict({
        type: ConflictType.FORMAT,
        local: {
          id: 'event-1',
          type: 'FORMAT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-1',
          payload: {
            position: 0,
            length: 10,
            attributes: { bold: true, fontSize: 12 }
          },
          vectorClock: { user1: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        remote: {
          id: 'event-2',
          type: 'FORMAT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-2',
          payload: {
            position: 0,
            length: 10,
            attributes: { italic: true, fontSize: 14 }
          },
          vectorClock: { user2: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        localRegion: { start: 0, end: 10 },
        remoteRegion: { start: 0, end: 10 }
      });
      
      // Resolve conflict with MERGE strategy
      const resolution = await resolver.resolveConflict(
        conflict, 
        ConflictResolutionStrategy.MERGE
      );
      
      // Verify merge resolution
      expect(resolution.result).toBe(ConflictResolutionResult.MERGED);
      expect(resolution.resolvedEvent).toBeDefined();
      
      // Bold and italic should be merged, fontSize should use one value
      const mergedAttributes = resolution.resolvedEvent!.payload.attributes;
      expect(mergedAttributes.bold).toBe(true);
      expect(mergedAttributes.italic).toBe(true);
      expect(mergedAttributes.fontSize).toBeDefined();
    });
    
    test('should resolve DELETE_MODIFIED conflicts by preserving modifications', async () => {
      // Create conflict
      const conflict = createTestConflict({
        type: ConflictType.DELETE_MODIFIED,
        local: {
          id: 'event-1',
          type: 'DELETE_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-1',
          payload: {
            position: 5,
            length: 10
          },
          vectorClock: { user1: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        remote: {
          id: 'event-2',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-2',
          payload: {
            position: 7,
            text: 'World'
          },
          vectorClock: { user2: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        localRegion: { start: 5, end: 15 },
        remoteRegion: { start: 7, end: 12 }
      });
      
      // Resolve conflict with MERGE strategy
      const resolution = await resolver.resolveConflict(
        conflict, 
        ConflictResolutionStrategy.MERGE
      );
      
      // Modified content should be preserved, so remote wins
      expect(resolution.result).toBe(ConflictResolutionResult.REMOTE_WINS);
      expect(resolution.resolvedEvent).toBe(conflict.remote);
    });
    
    test('should prioritize local changes when using LOCAL_FIRST strategy', async () => {
      // Create conflict
      const conflict = createTestConflict({
        type: ConflictType.TEXT_EDIT,
        local: {
          id: 'event-1',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-1',
          payload: {
            position: 5,
            text: 'Hello'
          },
          vectorClock: { user1: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        remote: {
          id: 'event-2',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-2',
          payload: {
            position: 5,
            text: 'World'
          },
          vectorClock: { user2: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        localRegion: { start: 5, end: 10 },
        remoteRegion: { start: 5, end: 10 }
      });
      
      // Resolve conflict with LOCAL_FIRST strategy
      const resolution = await resolver.resolveConflict(
        conflict,
        ConflictResolutionStrategy.LOCAL_FIRST
      );
      
      // Local should win
      expect(resolution.result).toBe(ConflictResolutionResult.LOCAL_WINS);
      expect(resolution.resolvedEvent).toBe(conflict.local);
    });
    
    test('should return UNRESOLVED when using MANUAL strategy', async () => {
      // Create conflict
      const conflict = createTestConflict({
        type: ConflictType.TEXT_EDIT,
        local: {
          id: 'event-1',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-1',
          payload: {
            position: 5,
            text: 'Hello'
          },
          vectorClock: { user1: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        remote: {
          id: 'event-2',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-2',
          payload: {
            position: 5,
            text: 'World'
          },
          vectorClock: { user2: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent
      });
      
      // Resolve conflict with MANUAL strategy
      const resolution = await resolver.resolveConflict(
        conflict,
        ConflictResolutionStrategy.MANUAL
      );
      
      // Should be marked as unresolved
      expect(resolution.result).toBe(ConflictResolutionResult.UNRESOLVED);
      expect(resolution.resolvedEvent).toBeUndefined();
    });
  });
  
  describe('applyResolution', () => {
    test('should apply resolved event to event store', async () => {
      // Create resolution with a resolved event
      const resolution = {
        result: ConflictResolutionResult.MERGED,
        resolvedEvent: {
          id: 'event-3',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-3',
          payload: {
            position: 5,
            text: 'Hello World'
          },
          vectorClock: { user1: 1, user2: 1 },
          timestamp: new Date().toISOString()
        } as BaseEvent,
        reason: 'Merged concurrent inserts'
      };
      
      // Apply the resolution
      const result = await resolver.applyResolution('doc-1', resolution);
      
      // Verify resolution was applied
      expect(result).toBe(true);
      expect(eventStore.appendEvent).toHaveBeenCalledWith(resolution.resolvedEvent);
      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        'conflict.resolution.applied',
        expect.any(Object)
      );
    });
    
    test('should return false when no resolved event is present', async () => {
      // Create resolution without a resolved event
      const resolution = {
        result: ConflictResolutionResult.UNRESOLVED,
        reason: 'Manual resolution required'
      };
      
      // Apply the resolution
      const result = await resolver.applyResolution('doc-1', resolution);
      
      // Verify resolution was not applied
      expect(result).toBe(false);
      expect(eventStore.appendEvent).not.toHaveBeenCalled();
    });
  });
  
  describe('resolveConflictsForDocument', () => {
    test('should resolve all conflicts for a document', async () => {
      // Create local event
      const localEvent = {
        id: 'event-1',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        aggregateVersion: 10,
        payload: {
          position: 5,
          text: 'Hello'
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as unknown as BaseEvent;
      
      // Mock remote events
      const remoteEvents = [
        {
          id: 'event-2',
          type: 'INSERT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-2',
          payload: {
            position: 5,
            text: 'World'
          },
          vectorClock: { user2: 1 },
          timestamp: new Date().toISOString()
        },
        {
          id: 'event-3',
          type: 'FORMAT_TEXT',
          aggregateId: 'doc-1',
          userId: 'user-3',
          payload: {
            position: 0,
            length: 10,
            attributes: { bold: true }
          },
          vectorClock: { user3: 1 },
          timestamp: new Date().toISOString()
        }
      ] as unknown as BaseEvent[];
      
      // Mock event store to return remote events
      eventStore.getEvents.mockResolvedValueOnce(remoteEvents);
      
      // Resolve conflicts
      const resolutions = await resolver.resolveConflictsForDocument('doc-1', localEvent);
      
      // Should have resolved conflicts
      expect(resolutions.length).toBeGreaterThan(0);
      expect(eventStore.getEvents).toHaveBeenCalledWith('doc-1', expect.any(Number));
    });
    
    test('should return empty array when no conflicts are detected', async () => {
      // Create local event
      const localEvent = {
        id: 'event-1',
        type: 'INSERT_TEXT',
        aggregateId: 'doc-1',
        userId: 'user-1',
        aggregateVersion: 10,
        payload: {
          position: 5,
          text: 'Hello'
        },
        vectorClock: { user1: 1 },
        timestamp: new Date().toISOString()
      } as unknown as BaseEvent;
      
      // Mock event store to return empty array (no remote events)
      eventStore.getEvents.mockResolvedValueOnce([]);
      
      // Resolve conflicts
      const resolutions = await resolver.resolveConflictsForDocument('doc-1', localEvent);
      
      // Should have no resolutions
      expect(resolutions).toEqual([]);
    });
  });
  
  describe('getRecommendedStrategy', () => {
    test('should recommend MERGE strategy for TEXT_EDIT conflicts', () => {
      const conflict = createTestConflict({
        type: ConflictType.TEXT_EDIT,
        local: {} as any,
        remote: {} as any
      });
      
      const strategy = resolver.getRecommendedStrategy(conflict);
      expect(strategy).toBe(ConflictResolutionStrategy.MERGE);
    });
    
    test('should recommend MERGE strategy for FORMAT conflicts', () => {
      const conflict = createTestConflict({
        type: ConflictType.FORMAT,
        local: {} as any,
        remote: {} as any
      });
      
      const strategy = resolver.getRecommendedStrategy(conflict);
      expect(strategy).toBe(ConflictResolutionStrategy.MERGE);
    });
    
    test('should recommend REMOTE_FIRST strategy for DELETE_MODIFIED conflicts', () => {
      const conflict = createTestConflict({
        type: ConflictType.DELETE_MODIFIED,
        local: {} as any,
        remote: {} as any
      });
      
      const strategy = resolver.getRecommendedStrategy(conflict);
      expect(strategy).toBe(ConflictResolutionStrategy.REMOTE_FIRST);
    });
    
    test('should recommend MANUAL strategy for STRUCTURAL conflicts', () => {
      const conflict = createTestConflict({
        type: ConflictType.STRUCTURAL,
        local: {} as any,
        remote: {} as any
      });
      
      const strategy = resolver.getRecommendedStrategy(conflict);
      expect(strategy).toBe(ConflictResolutionStrategy.MANUAL);
    });
  });
  
  describe('getConflictStatistics', () => {
    test('should retrieve conflict statistics for a document', async () => {
      // Mock metrics values
      metricsCollector.getCounter
        .mockResolvedValueOnce(10) // totalConflicts
        .mockResolvedValueOnce(7);  // resolvedConflicts
        
      metricsCollector.getAverageValue
        .mockResolvedValueOnce(120); // avg resolution time
      
      // Get statistics
      const stats = await resolver.getConflictStatistics('doc-1');
      
      // Verify statistics
      expect(stats.totalConflicts).toBe(10);
      expect(stats.resolvedConflicts).toBe(7);
      expect(stats.unresolvedConflicts).toBe(3); // 10 - 7
      expect(stats.averageResolutionTimeMs).toBe(120);
    });
  });
});
