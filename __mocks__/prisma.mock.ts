import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create proper mock functions with mockResolvedValue support
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
  fn.mockResolvedValueOnce = (value) => {
    fn.mockImplementationOnce(() => Promise.resolve(value));
    return fn;
  };
  fn.mockRejectedValueOnce = (error) => {
    fn.mockImplementationOnce(() => Promise.reject(error));
    return fn;
  };
  return fn;
};

// Create mock models
const createMockModel = () => ({
  findFirst: createMockFunction(),
  findMany: createMockFunction(),
  findUnique: createMockFunction(),
  create: createMockFunction(),
  update: createMockFunction(),
  delete: createMockFunction(),
  deleteMany: createMockFunction(),
  count: createMockFunction(),
  updateMany: createMockFunction(),
  upsert: createMockFunction()
});

// Create the prisma mock with ALL required models
const prisma = {
  // Required models from test errors
  event: createMockModel(),
  snapshot: createMockModel(),
  document: createMockModel(),
  user: createMockModel(),
  complianceLog: createMockModel(),
  complianceAudit: createMockModel(),
  
  // Transaction method
  $transaction: jest.fn().mockImplementation(async (callback) => {
    if (typeof callback === 'function') {
      return callback(prisma);
    }
    return Promise.all(callback);
  }),
  
  // For middleware
  $use: jest.fn().mockImplementation(middleware => prisma),
  
  // Connection methods
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