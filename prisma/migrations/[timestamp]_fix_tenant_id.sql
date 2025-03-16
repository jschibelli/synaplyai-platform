-- First add the column with a default value
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- Create the index
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");