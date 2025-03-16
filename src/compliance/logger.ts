// src/compliance/logger.ts
import { prisma } from '../prisma/client';
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
   * Records an immutable compliance log entry
   */
  static async log(entry: ComplianceLogEntry): Promise<void> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot log compliance event: No tenant context available');
    }
    
    await prisma.complianceLog.create({
      data: {
        tenantId: tenantContext.tenantId,
        eventType: entry.eventType,
        resourceId: entry.resourceId,
        userId: entry.userId || tenantContext.userId,
        description: entry.description,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        createdAt: new Date()
      }
    });
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