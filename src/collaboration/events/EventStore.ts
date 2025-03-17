import { MetricsCollector } from '../../metrics/collector';
import { getCurrentTenantContext } from '../../lib/tenant-context';

export interface EventMetadata {
  schemaVersion: number;
  correlationId?: string;
  causationId?: string;
  vectorClock?: Record<string, number>;
}

export interface Event {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  tenantId: string;
  documentId: string;
  userId: string;
  metadata: EventMetadata;
}

export class EventStore {
  constructor(
    private metricsCollector: MetricsCollector,
    private prisma: any
  ) {}

  async store(event: Omit<Event, 'id' | 'timestamp'>): Promise<Event> {
    const tenantContext = getCurrentTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }

    const storedEvent = await this.prisma.event.create({
      data: {
        type: event.type,
        payload: event.payload,
        tenantId: tenantContext.tenantId,
        documentId: event.documentId,
        userId: event.userId,
        timestamp: Date.now()
      }
    });

    await this.metricsCollector.increment('event.stored', tenantContext.tenantId);
    return storedEvent;
  }

  async getEvents(documentId: string, afterTimestamp?: number): Promise<Event[]> {
    const tenantContext = getCurrentTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }

    return this.prisma.event.findMany({
      where: {
        documentId,
        tenantId: tenantContext.tenantId,
        timestamp: afterTimestamp ? { gt: afterTimestamp } : undefined
      },
      orderBy: { timestamp: 'asc' }
    });
  }
}