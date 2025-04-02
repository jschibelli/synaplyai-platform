import { jest } from '@jest/globals';

// Create a very basic mock with just what tests need
const prisma = {
  user: {
    findUnique: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({})
  },
  document: {
    findUnique: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({})
  },
  event: {
    findUnique: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({})
  },
  snapshot: {
    findUnique: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({})
  },
  
  $transaction: jest.fn(async (cb) => typeof cb === 'function' ? cb(prisma) : Promise.all(cb)),
  $use: jest.fn(() => prisma),
  $extends: jest.fn(() => prisma),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined)
};

export default prisma;