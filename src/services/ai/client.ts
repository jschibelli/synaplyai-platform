import { PrismaClient } from '@prisma/client';
import { addTenantMiddleware } from './middleware';

// Create a singleton Prisma client
let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
  prisma = addTenantMiddleware(prisma);
} else {
  // Prevent multiple instances during hot-reloading in development
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
    (global as any).prisma = addTenantMiddleware((global as any).prisma);
  }
  prisma = (global as any).prisma;
}

export default prisma;