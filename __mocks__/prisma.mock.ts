import { jest } from '@jest/globals';

/**
 * Create a model with all standard Prisma methods
 */
const createModelMock = () => {
  return {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve({})),
    findFirst: jest.fn().mockImplementation(() => Promise.resolve({})),
    findMany: jest.fn().mockImplementation(() => Promise.resolve([])),
    create: jest.fn().mockImplementation(() => Promise.resolve({})),
    createMany: jest.fn().mockImplementation(() => Promise.resolve({ count: 1 })),
    update: jest.fn().mockImplementation(() => Promise.resolve({})),
    updateMany: jest.fn().mockImplementation(() => Promise.resolve({ count: 1 })),
    upsert: jest.fn().mockImplementation(() => Promise.resolve({})),
    delete: jest.fn().mockImplementation(() => Promise.resolve({})),
    deleteMany: jest.fn().mockImplementation(() => Promise.resolve({ count: 1 })),
    count: jest.fn().mockImplementation(() => Promise.resolve(0)),
    aggregate: jest.fn().mockImplementation(() => Promise.resolve({})),
    groupBy: jest.fn().mockImplementation(() => Promise.resolve([]))
  };
};

// Define the type for our Prisma mock with ALL properties it will have
interface PrismaMock {
  user: ReturnType<typeof createModelMock>;
  document: ReturnType<typeof createModelMock>;
  event: ReturnType<typeof createModelMock>;
  snapshot: ReturnType<typeof createModelMock>;
  complianceLog: ReturnType<typeof createModelMock>;
  complianceAudit: ReturnType<typeof createModelMock>;
  conflict: ReturnType<typeof createModelMock>;
  subscription: ReturnType<typeof createModelMock>;
  tenantSettings: ReturnType<typeof createModelMock>;
  usageMetrics: ReturnType<typeof createModelMock>;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $on: jest.Mock;
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  $use: jest.Mock;
  $extends: jest.Mock;
}

// Create the mock object with explicit type
const prismaMock = {
  // Models
  user: createModelMock(),
  document: createModelMock(),
  event: createModelMock(),
  snapshot: createModelMock(),
  complianceLog: createModelMock(),
  complianceAudit: createModelMock(),
  conflict: createModelMock(),
  subscription: createModelMock(),
  tenantSettings: createModelMock(),
  usageMetrics: createModelMock(),
  
  // Client methods
  $connect: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  $disconnect: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  $on: jest.fn().mockImplementation(() => undefined),
  $executeRaw: jest.fn().mockImplementation(() => Promise.resolve(1)),
  $queryRaw: jest.fn().mockImplementation(() => Promise.resolve([])),
  
  // Add these methods directly in the object literal to avoid the errors
  $transaction: jest.fn().mockImplementation(async (cb) => {
    if (typeof cb === 'function') {
      return await cb(prismaMock);
    }
    return Promise.all(Array.isArray(cb) ? cb : []);
  }),
  $use: jest.fn().mockImplementation((middleware) => {
    return prismaMock;
  }),
  $extends: jest.fn().mockImplementation(() => {
    return prismaMock;
  })
} as PrismaMock; // Type assertion to let TypeScript know all properties will exist

// Create a module.exports override to ensure CommonJS compatibility
module.exports = prismaMock;
// Also support ES modules
export default prismaMock;