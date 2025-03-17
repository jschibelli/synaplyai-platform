export interface Snapshot {
  id: string;
  documentId: string;
  tenantId: string;
  state: any;
  version: number;
  timestamp: number;
  lastEventId: string;
}

export class SnapshotStore {
  constructor(
    private prisma: any,
    private metricsCollector: MetricsCollector
  ) {}

  async createSnapshot(documentId: string, state: any): Promise<Snapshot>;
  async getLatestSnapshot(documentId: string): Promise<Snapshot | null>;
}