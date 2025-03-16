import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from '@/lib/tenantContext';

/**
 * Adds tenant filtering to Prisma queries
 * This ensures data isolation between tenants
 */
export function addTenantMiddleware(prisma: PrismaClient): PrismaClient {
  prisma.$use(async (params, next) => {
    const tenantId = getCurrentTenantId();
    
    // Skip tenant filtering for specific models or actions
    const excludedModels = ['Subscription'];
    const excludedActions = ['count'];
    
    if (
      !tenantId || 
      excludedModels.includes(params.model || '') ||
      excludedActions.includes(params.action)
    ) {
      return next(params);
    }
    
    // For queries that should respect tenant isolation
    if (['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      
      // Add tenantId filter
      params.args.where.tenantId = tenantId;
    }
    
    // For create operations
    if (params.action === 'create') {
      if (!params.args) params.args = {};
      if (!params.args.data) params.args.data = {};
      
      // Add tenantId to the data being created
      params.args.data.tenantId = tenantId;
    }
    
    // For createMany operations
    if (params.action === 'createMany') {
      if (!params.args) params.args = {};
      if (!params.args.data) params.args.data = [];
      
      // Add tenantId to all records being created
      params.args.data = params.args.data.map((data: any) => ({
        ...data,
        tenantId
      }));
    }
    
    return next(params);
  });
  
  return prisma;
}

