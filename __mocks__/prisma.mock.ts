import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Mock of Prisma client for testing
export const prisma = mockDeep<PrismaClient>({
  // Add the event model that tests need
  event: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  // Add the complianceLog model
  complianceLog: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  // Add the complianceAudit model
  complianceAudit: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  // Add the snapshot model
  snapshot: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  // Add other models as needed
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  document: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
});

// Use this in your beforeEach to reset mocks
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

export const mockReset = () => {
  mockReset(prismaMock);
};

// Mock implementation of $transaction
prismaMock.$transaction.mockImplementation(async (callback) => {
  if (typeof callback === 'function') {
    return callback(prismaMock);
  }
  return Promise.all(callback);
});

export default prisma;