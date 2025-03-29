// If this file doesn't exist, create it

import { PrismaClient } from '@prisma/client';

// Create a fully typed mock of PrismaClient
export const mockPrismaClient = {
  event: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  snapshot: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn()
  },
  document: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn()
  },
  tenant: {
    findUnique: jest.fn()
  },
  $transaction: jest.fn().mockImplementation((fn) => fn())
} as unknown as jest.Mocked<PrismaClient>;

// src/__mocks__/prisma.ts
export const prisma = {
  event: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn()
  },
  // other properties...
} as unknown as jest.Mocked<PrismaClient>;

// Set up Jest mock
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient)
}));