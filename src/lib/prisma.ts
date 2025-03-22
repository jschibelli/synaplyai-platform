import { PrismaClient } from '@prisma/client';
import { getTenantContext } from './tenantContext';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create a new PrismaClient instance with custom configuration to fix 
// the "missing enableTracing" error
export const prisma = global.prisma || new PrismaClient({
  log: ['query', 'error', 'warn'],
  __internal: {
    engine: {
      enableTracing: false, // Fix for the enableTracing error
    },
  },
});

// Add middleware for tenant isolation
prisma.$use(async (params, next) => {
  const tenantContext = getTenantContext();
  
  // Skip tenant filtering for specific models or actions
  const excludedModels = ['Subscription'];
  const skipTenantFilter = !tenantContext?.tenantId || 
                          excludedModels.includes(params.model || '') ||
                          !['findUnique', 'findFirst', 'findMany', 'create', 'update', 'delete'].includes(params.action);
  
  if (skipTenantFilter) {
    return next(params);
  }
  
  // For queries that should respect tenant isolation
  if (['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    
    // Add tenantId filter
    params.args.where.tenantId = tenantContext.tenantId;
  }
  
  // For create operations
  if (params.action === 'create') {
    if (!params.args) params.args = {};
    if (!params.args.data) params.args.data = {};
    
    // Add tenantId to the data being created
    params.args.data.tenantId = tenantContext.tenantId;
  }
  
  return next(params);
});

// In development, prevent having multiple instances of Prisma Client in hot-reloading
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export default prisma;