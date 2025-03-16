import { tenantContextStorage, TenantContext } from '../../src/lib/tenantContext';
import { PrismaClient } from '@prisma/client';
import { addTenantMiddleware } from '../../src/prisma/middleware';

describe('Tenant Isolation', () => {
  let prisma: PrismaClient;
  let user1Id: string;
  let user2Id: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    prisma = addTenantMiddleware(prisma);

    // Create test users
    const user1 = await prisma.user.create({
      data: {
        email: 'user1@test.com',
        role: 'user'
      }
    });
    user1Id = user1.id;

    const user2 = await prisma.user.create({
      data: {
        email: 'user2@test.com',
        role: 'user'
      }
    });
    user2Id = user2.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.document.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    jest.clearAllMocks();
  });

  it('should isolate data between tenants', async () => {
    // Test data for tenant 1
    const tenant1Context: TenantContext = {
      tenantId: 'tenant-1',
      userId: user1Id,
      requestId: 'request-1',
      traceId: 'trace-1'
    };

    // Test data for tenant 2
    const tenant2Context: TenantContext = {
      tenantId: 'tenant-2',
      userId: user2Id,
      requestId: 'request-2',
      traceId: 'trace-2'
    };

    // Create test document for tenant 1
    await tenantContextStorage.run(tenant1Context, async () => {
      await prisma.document.create({
        data: {
          title: 'Tenant 1 Document',
          content: 'This belongs to tenant 1',
          userId: user1Id,
          tenantId: 'tenant-1'
        }
      });
    });

    // Create test document for tenant 2
    await tenantContextStorage.run(tenant2Context, async () => {
      await prisma.document.create({
        data: {
          title: 'Tenant 2 Document',
          content: 'This belongs to tenant 2',
          userId: user2Id,
          tenantId: 'tenant-2'
        }
      });
    });

    // Verify tenant 1 can only see their document
    await tenantContextStorage.run(tenant1Context, async () => {
      const docs = await prisma.document.findMany();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Tenant 1 Document');
    });

    // Verify tenant 2 can only see their document
    await tenantContextStorage.run(tenant2Context, async () => {
      const docs = await prisma.document.findMany();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Tenant 2 Document');
    });
  });

  it('should prevent cross-tenant access', async () => {
    const tenant1Context: TenantContext = {
      tenantId: 'tenant-1',
      userId: user1Id,
      requestId: 'request-1',
      traceId: 'trace-1'
    };

    // Create document as tenant 1
    let documentId: string;
    await tenantContextStorage.run(tenant1Context, async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Confidential Document',
          content: 'Secret data',
          userId: user1Id,
          tenantId: 'tenant-1'
        }
      });
      documentId = doc.id;
    });

    // Try to access as tenant 2
    await tenantContextStorage.run({
      tenantId: 'tenant-2',
      userId: user2Id,
      requestId: 'request-2',
      traceId: 'trace-2'
    }, async () => {
      const doc = await prisma.document.findUnique({
        where: { id: documentId }
      });
      expect(doc).toBeNull();
    });
  });

  it('should maintain tenant context throughout async operations', async () => {
    const context: TenantContext = {
      tenantId: 'test-tenant',
      userId: user1Id,
      requestId: 'test-request',
      traceId: 'test-trace'
    };

    await tenantContextStorage.run(context, async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      const currentContext = tenantContextStorage.getStore();
      expect(currentContext).toEqual(context);
    });
  });
});