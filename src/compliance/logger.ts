import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { getTenantContext } from '../middleware/tenant-context';

export interface ComplianceLogEntry {
  eventType: string;
  resourceId?: string;
  userId?: string;
  description: string;
  metadata?: Record<string, any>;
}

export class ComplianceLogger {
  /**
   * Records an immutable compliance log entry with integrity hashing
   */
  static async log(entry: ComplianceLogEntry): Promise<void> {
    const tenantContext = getTenantContext();

    if (!tenantContext?.tenantId) {
      throw new Error('Cannot log compliance event: No tenant context available');
    }

    // Create evidence hash for integrity verification
    const evidenceHash = this.generateEvidenceHash({
      tenantId: tenantContext.tenantId,
      eventType: entry.eventType,
      timestamp: new Date().toISOString(),
      description: entry.description,
      metadata: entry.metadata
    });

    // Insert record with evidence hash
    await prisma.complianceLog.create({
      data: {
        tenantId: tenantContext.tenantId,
        eventType: entry.eventType,
        resourceId: entry.resourceId,
        userId: entry.userId || tenantContext.userId,
        description: entry.description,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        evidenceHash,
        createdAt: new Date()
      }
    });
  }

  /**
   * Generate a SHA-256 hash of the log entry data for integrity verification
   */
  private static generateEvidenceHash(data: Record<string, any>): string {
    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Validate the integrity of compliance logs by checking evidence hashes
   * Returns violations found (empty array means all logs are valid)
   */
  static async validateLogs(tenantId: string, batchSize: number = 1000): Promise<Array<{ id: string, issue: string }>> {
    const violations = [];
    let processed = 0;
    let hasMore = true;
    let lastId = '';

    // Process in batches to avoid memory issues with large log volumes
    while (hasMore) {
      const logs = await prisma.complianceLog.findMany({
        where: { 
          tenantId,
          ...(lastId ? { id: { gt: lastId } } : {})
        },
        orderBy: { id: 'asc' },
        take: batchSize
      });

      if (logs.length === 0) {
        hasMore = false;
        continue;
      }

      for (const log of logs) {
        // Calculate what the hash should be
        const expectedHash = this.generateEvidenceHash({
          tenantId: log.tenantId,
          eventType: log.eventType,
          timestamp: log.createdAt.toISOString(),
          description: log.description,
          metadata: log.metadata ? JSON.parse(log.metadata as string) : null
        });

        // Compare with stored hash
        if (expectedHash !== log.evidenceHash) {
          violations.push({
            id: log.id,
            issue: 'Hash mismatch: potential data tampering detected'
          });

          // Log the violation to a separate secure audit log
          await prisma.complianceAudit.create({
            data: {
              operation: 'INTEGRITY_CHECK',
              recordId: log.id,
              tableName: 'ComplianceLog',
              changedBy: 'system',
              changedAt: new Date(),
              details: JSON.stringify({
                issue: 'Hash mismatch',
                expectedHash,
                storedHash: log.evidenceHash
              })
            }
          });
        }

        lastId = log.id;
        processed++;
      }

      // Log progress for long-running validations
      if (processed % 10000 === 0) {
        console.log(`Validated ${processed} compliance logs for tenant ${tenantId}`);
      }
    }

    return violations;
  }

  /**
   * Query compliance logs with tenant isolation enforced
   */
  static async query(
    filters: {
      eventType?: string;
      resourceId?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
  ) {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot query compliance logs: No tenant context available');
    }
    
    const where = {
      tenantId: tenantContext.tenantId,
      ...(filters.eventType && { eventType: filters.eventType }),
      ...(filters.resourceId && { resourceId: filters.resourceId }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.startDate && filters.endDate && { 
        createdAt: { 
          gte: filters.startDate,
          lte: filters.endDate
        } 
      })
    };
    
    const [records, total] = await Promise.all([
      prisma.complianceLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.complianceLog.count({ where })
    ]);
    
    return {
      records,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize)
      }
    };
  }
}