import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { getTenantContext } from '../middleware/tenant-context';

interface ComplianceLogEvent {
  eventType: string;
  resourceId: string;
  description: string;
  metadata?: Record<string, any>;
  userId?: string;
}

/**
 * Compliance logging service to maintain immutable audit trail
 */
export class ComplianceLogger {
  private static prisma: PrismaClient;

  /**
   * Initialize the compliance logger with a database client
   */
  static initialize(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Log a compliance event with evidence hash
   */
  static async log(event: ComplianceLogEvent): Promise<void> {
    try {
      const { tenantId = 'system', userId = 'system' } = getTenantContext() || {};
      
      // Generate tamper-evident hash from event data
      const evidenceHash = this.generateEvidenceHash(event);
      
      // Create compliance log entry
      await this.prisma?.complianceLog.create({
        data: {
          tenantId,
          userId: event.userId || userId,
          eventType: event.eventType,
          resourceId: event.resourceId,
          description: event.description,
          metadata: event.metadata || {},
          evidenceHash
        }
      });
    } catch (error) {
      console.error(`Failed to log compliance event: ${error.message}`);
    }
  }

  /**
   * Generate cryptographic hash of event data for tamper detection
   */
  private static generateEvidenceHash(event: ComplianceLogEvent): string {
    const timestamp = new Date().toISOString();
    const dataToHash = JSON.stringify({
      ...event,
      timestamp
    });
    
    return createHash('sha256').update(dataToHash).digest('hex');
  }

  /**
   * Verify integrity of compliance logs
   */
  static async verifyLogIntegrity(tenantId: string, startId = '0'): Promise<boolean> {
    try {
      // Get logs in batches to verify chronological integrity
      const logs = await this.prisma?.complianceLog.findMany({
        where: {
          tenantId,
          id: { gt: parseInt(startId) }
        },
        orderBy: { id: 'asc' },
        take: 100
      });
      
      if (!logs || logs.length === 0) return true;
      
      let lastId = 0;
      
      // Verify each log entry's hash
      for (const log of logs) {
        // Recalculate hash to verify
        const expectedHash = this.generateEvidenceHash({
          eventType: log.eventType,
          resourceId: log.resourceId,
          description: log.description,
          metadata: log.metadata as Record<string, any>,
          userId: log.userId
        });
        
        // If hashes don't match, log tampering detected
        if (expectedHash !== log.evidenceHash) {
          // Record tampering detection in audit log
          await this.prisma?.complianceAudit.create({
            data: {
              tenantId,
              eventType: 'TAMPERING_DETECTED',
              resourceId: `log-${log.id}`,
              description: `Data tampering detected in compliance log ${log.id}`,
              metadata: {
                logId: log.id,
                expectedHash,
                storedHash: log.evidenceHash
              }
            }
          });
          
          return false;
        }
        
        lastId = log.id;
      }
      
      // Recursively check next batch if needed
      if (logs.length === 100) {
        return this.verifyLogIntegrity(tenantId, String(lastId));
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to verify log integrity: ${error.message}`);
      return false;
    }
  }
}