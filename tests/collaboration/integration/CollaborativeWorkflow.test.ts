import { PrismaClient } from '@prisma/client';
import { EventStore } from '../../../src/collaboration/events/EventStore';
import { SnapshotStore } from '../../../src/collaboration/snapshots/SnapshotStore';
import { TransactionManager } from '../../../src/collaboration/transactions/TransactionManager';
import { DocumentReconstructor } from '../../../src/collaboration/DocumentReconstructor';
import { EventBus } from '../../../src/collaboration/events/EventBus';
import { OperationalTransform } from '../../../src/collaboration/conflict/OperationalTransform';
import { CommandEventIntegrator } from '../../../src/collaboration/integration/CommandEventIntegrator';
import { MetricsCollector } from '../../../src/metrics/collector';
import { setTenantContext } from '../../../src/lib/tenant-context';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('../../../src/metrics/collector');

describe('Collaborative Document Workflow Integration', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let eventStore: EventStore;
  let snapshotStore: SnapshotStore;
  let transactionManager: TransactionManager;
  let eventBus: EventBus;
  let documentReconstructor: DocumentReconstructor;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  let commandIntegrator: CommandEventIntegrator;
  let operationalTransform: OperationalTransform;
  
  beforeEach(() => {
    // Set up tenant context for tests
    setTenantContext({
      tenantId: 'test-tenant',
      userId: 'test-user',
      requestId: 'test-request',
      traceId: 'test-trace'
    });
    
    // Set up mocks
    prisma = {
      event: {
        create: jest.fn().mockImplementation((args) => Promise.resolve(args.data)),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      },
      snapshot: {
        create: jest.fn().mockImplementation((args) => Promise.resolve(args.data)),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      $transaction: jest.fn().mockImplementation(async (fn) => {
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        return prisma;
      })
    } as unknown as jest.Mocked<PrismaClient>;
    
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create components
    operationalTransform = new OperationalTransform();
    eventStore = new EventStore(prisma, metricsCollector);
    snapshotStore = new SnapshotStore(prisma, metricsCollector);
    transactionManager = new TransactionManager(prisma, metricsCollector);
    eventBus = new EventBus(metricsCollector);
    documentReconstructor = new DocumentReconstructor(
      eventStore, 
      snapshotStore,
      operationalTransform,
      metricsCollector
    );
    commandIntegrator = new CommandEventIntegrator(
      eventStore,
      transactionManager,
      metricsCollector
    );
  });
  
  test('should create and update a document through the complete event-sourced workflow', async () => {
    // Document ID for our test
    const documentId = 'test-doc-1';
    
    // Track events received through the event bus
    const receivedEvents: any[] = [];
    const subscription = eventBus.subscribe((event) => {
      receivedEvents.push(event);
    }, { documentId });
    
    try {
      // 1. Create a document with initial content
      // Mock events to be returned after creation
      const createEvent = {
        id: 'evt-1',
        type: 'DOCUMENT_CREATED',
        documentId,
        tenantId: 'test-tenant',
        userId: 'test-user',
        payload: { title: 'Test Document', content: '' },
        version: 1,
        timestamp: Date.now()
      };
      
      // Set up mock for event retrieval
      prisma.event.findMany.mockResolvedValueOnce([createEvent]);
      
      // Execute create document command
      await commandIntegrator.executeCommand(
        {
          type: 'CREATE_DOCUMENT',
          payload: {
            documentId,
            title: 'Test Document'
          },
          userId: 'test-user'
        },
        async (command, txId) => {
          // In a real implementation, this would validate and process the command
          const event = {
            type: 'DOCUMENT_CREATED',
            documentId: command.payload.documentId,
            tenantId: 'test-tenant',
            userId: command.userId,
            payload: {
              title: command.payload.title,
              content: ''
            }
          };
          
          // Publish to event bus for real-time updates
          await eventBus.publish(event);
          
          return {
            result: { documentId, success: true },
            events: [event]
          };
        }
      );
      
      // 2. Insert text into the document
      const insertEvent = {
        id: 'evt-2',
        type: 'INSERT_TEXT',
        documentId,
        tenantId: 'test-tenant',
        userId: 'test-user',
        payload: { position: 0, text: 'Hello world' },
        version: 2,
        timestamp: Date.now()
      };
      
      // Update mock for event retrieval to include both events
      prisma.event.findMany.mockResolvedValueOnce([createEvent, insertEvent]);
      
      // Execute insert text command
      await commandIntegrator.executeCommand(
        {
          type: 'INSERT_TEXT',
          payload: {
            documentId,
            position: 0,
            text: 'Hello world'
          },
          userId: 'test-user'
        },
        async (command, txId) => {
          // In a real implementation, this would validate and process the command
          const event = {
            type: 'INSERT_TEXT',
            documentId: command.payload.documentId,
            tenantId: 'test-tenant',
            userId: command.userId,
            payload: {
              position: command.payload.position,
              text: command.payload.text
            }
          };
          
          // Publish to event bus for real-time updates
          await eventBus.publish(event);
          
          return {
            result: { success: true },
            events: [event]
          };
        }
      );
      
      // 3. Format text in the document
      const formatEvent = {
        id: 'evt-3',
        type: 'FORMAT_TEXT',
        documentId,
        tenantId: 'test-tenant',
        userId: 'test-user',
        payload: { position: 0, length: 5, attributes: { bold: true } },
        version: 3,
        timestamp: Date.now()
      };
      
      // Update mock for event retrieval to include all events
      prisma.event.findMany.mockResolvedValueOnce([createEvent, insertEvent, formatEvent]);
      
      // Execute format text command
      await commandIntegrator.executeCommand(
        {
          type: 'FORMAT_TEXT',
          payload: {
            documentId,
            position: 0,
            length: 5,
            attributes: { bold: true }
          },
          userId: 'test-user'
        },
        async (command, txId) => {
          // In a real implementation, this would validate and process the command
          const event = {
            type: 'FORMAT_TEXT',
            documentId: command.payload.documentId,
            tenantId: 'test-tenant',
            userId: command.userId,
            payload: {
              position: command.payload.position,
              length: command.payload.length,
              attributes: command.payload.attributes
            }
          };
          
          // Publish to event bus for real-time updates
          await eventBus.publish(event);
          
          return {
            result: { success: true },
            events: [event]
          };
        }
      );
      
      // 4. Reconstruct the document state
      const document = await documentReconstructor.reconstructDocument(documentId);
      
      // 5. Verify the document state
      expect(document.content).toBe('Hello world');
      expect(document.formatting['0:5']).toEqual({ bold: true });
      expect(document.metadata.title).toBe('Test Document');
      expect(document.version).toBe(3);
      
      // Verify events were published to the EventBus
      expect(receivedEvents.length).toBe(3);
      expect(receivedEvents[0].type).toBe('DOCUMENT_CREATED');
      expect(receivedEvents[1].type).toBe('INSERT_TEXT');
      expect(receivedEvents[2].type).toBe('FORMAT_TEXT');
      
      // Verify event store interactions
      expect(prisma.event.create).toHaveBeenCalledTimes(3);
      expect(prisma.event.findMany).toHaveBeenCalledTimes(3);
      
      // Verify transaction manager was used
      expect(prisma.$transaction).toHaveBeenCalled();
    } finally {
      // Clean up subscription
      subscription.unsubscribe();
    }
  });
  
  test('should handle concurrent edits from multiple users', async () => {
    // Document ID for our test
    const documentId = 'test-doc-2';
    
    // Mock initial document creation
    const createEvent = {
      id: 'evt-1',
      type: 'DOCUMENT_CREATED',
      documentId,
      tenantId: 'test-tenant',
      userId: 'user-1',
      payload: { title: 'Collaborative Document', content: 'Initial content' },
      version: 1,
      timestamp: Date.now() - 1000
    };
    
    // Set up mock for initial state
    prisma.event.findMany.mockResolvedValueOnce([createEvent]);
    
    // Create document (already mocked to return the event above)
    const initialDocument = await documentReconstructor.reconstructDocument(documentId);
    expect(initialDocument.content).toBe('Initial content');
    
    // Track received events for each user
    const user1Events: any[] = [];
    const user2Events: any[] = [];
    
    // Subscribe for user 1
    setTenantContext({
      tenantId: 'test-tenant',
      userId: 'user-1',
      requestId: 'request-1',
      traceId: 'trace-1'
    });
    
    const user1Subscription = eventBus.subscribe((event) => {
      user1Events.push(event);
    }, { documentId });
    
    // Subscribe for user 2
    setTenantContext({
      tenantId: 'test-tenant',
      userId: 'user-2',
      requestId: 'request-2',
      traceId: 'trace-2'
    });
    
    const user2Subscription = eventBus.subscribe((event) => {
      user2Events.push(event);
    }, { documentId });
    
    try {
      // User 1 edits the document
      setTenantContext({
        tenantId: 'test-tenant',
        userId: 'user-1',
        requestId: 'request-1',
        traceId: 'trace-1'
      });
      
      const user1Event = {
        id: 'evt-2',
        type: 'INSERT_TEXT',
        documentId,
        tenantId: 'test-tenant',
        userId: 'user-1',
        payload: { position: 16, text: ' from User 1' },
        version: 2,
        timestamp: Date.now() - 500
      };
      
      // Update mock for next event retrieval
      prisma.event.findMany.mockResolvedValueOnce([createEvent, user1Event]);
      
      // User 1 edits document
      await commandIntegrator.executeCommand(
        {
          type: 'INSERT_TEXT',
          payload: {
            documentId,
            position: 16,
            text: ' from User 1'
          },
          userId: 'user-1'
        },
        async (command, txId) => {
          // In a real implementation, this would validate and process the command
          const event = user1Event;
          
          // Publish to event bus for real-time updates
          await eventBus.publish(event);
          
          return {
            result: { success: true },
            events: [event]
          };
        }
      );
      
      // User 2 edits the document concurrently
      setTenantContext({
        tenantId: 'test-tenant',
        userId: 'user-2',
        requestId: 'request-2',
        traceId: 'trace-2'
      });
      
      const user2Event = {
        id: 'evt-3',
        type: 'INSERT_TEXT',
        documentId,
        tenantId: 'test-tenant',
        userId: 'user-2',
        payload: { position: 16, text: ' from User 2' },
        version: 3,
        timestamp: Date.now()
      };
      
      // Update mock for next event retrieval
      prisma.event.findMany.mockResolvedValueOnce([createEvent, user1Event, user2Event]);
      
      // User 2 edits document
      await commandIntegrator.executeCommand(
        {
          type: 'INSERT_TEXT',
          payload: {
            documentId,
            position: 16,
            text: ' from User 2'
          },
          userId: 'user-2'
        },
        async (command, txId) => {
          // In a real implementation, this would validate and process the command
          const event = user2Event;
          
          // Publish to event bus for real-time updates
          await eventBus.publish(event);
          
          return {
            result: { success: true },
            events: [event]
          };
        }
      );
      
      // Reconstruct final document state
      const finalDocument = await documentReconstructor.reconstructDocument(documentId);
      
      // Verify document contains both users' edits
      // In a real system with proper OT, this would be correctly merged
      expect(finalDocument.content).toBe('Initial content from User 2 from User 1');
      expect(finalDocument.version).toBe(3);
      
      // Verify both users received all events
      expect(user1Events.length).toBe(2); // Both user1's and user2's events
      expect(user2Events.length).toBe(2); // Both user1's and user2's events
      
      // Verify event store interactions
      expect(prisma.event.create).toHaveBeenCalledTimes(2);
    } finally {
      // Clean up subscriptions
      user1Subscription.unsubscribe();
      user2Subscription.unsubscribe();
    }
  });
});