import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create a properly structured Prisma mock

// Create a mock function with promise support
const createMockFunction = () => {
  const fn = jest.fn();
  fn.mockResolvedValue = (value) => {
    fn.mockImplementation(() => Promise.resolve(value));
    return fn;
  };
  fn.mockRejectedValue = (error) => {
    fn.mockImplementation(() => Promise.reject(error));
    return fn;
  };
  return fn;
};

// Create a complete model mock with all common methods
const createModelMock = () => ({
  findMany: createMockFunction(),
  findFirst: createMockFunction(),
  findUnique: createMockFunction(),
  create: createMockFunction(),
  createMany: createMockFunction(),
  update: createMockFunction(),
  updateMany: createMockFunction(),
  upsert: createMockFunction(),
  delete: createMockFunction(),
  deleteMany: createMockFunction(),
  count: createMockFunction()
});

// Create the prisma mock
const prisma = {
  // Add all models needed for tests
  user: createModelMock(),
  document: createModelMock(),
  subscription: createModelMock(),
  event: createModelMock(),
  snapshot: createModelMock(),
  complianceLog: createModelMock(),
  complianceAudit: createModelMock(),
  
  // Add Prisma client methods
  $transaction: jest.fn().mockImplementation(async (fn) => {
    if (typeof fn === 'function') {
      return await fn(prisma);
    }
    return Promise.all(fn);
  }),
  $use: jest.fn(),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined)
};

// Export the mock with proper typing
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// Reset mock helper function
export const resetMocks = () => {
  mockReset(prismaMock);
};

export default prisma;