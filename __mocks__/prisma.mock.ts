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

// Create a basic Prisma mock with necessary models
const prisma = {
  user: createModelMock(),
  document: createModelMock(),
  event: createModelMock(),
  snapshot: createModelMock(),
  
  // Client methods
  $connect: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  $disconnect: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  $on: jest.fn(),
  $executeRaw: jest.fn().mockImplementation(() => Promise.resolve(1)),
  $queryRaw: jest.fn().mockImplementation(() => Promise.resolve([])),
  
  // Fix for the transaction method error with Promise.all
  $transaction: jest.fn().mockImplementation(async (cb) => {
    if (typeof cb === 'function') {
      return await cb(prisma);
    }
    if (Array.isArray(cb)) {
      return Promise.all(cb);
    }
    return Promise.resolve(cb);
  }),
  
  $use: jest.fn().mockImplementation(() => prisma),
  $extends: jest.fn().mockImplementation(() => prisma)
};

export default prisma;