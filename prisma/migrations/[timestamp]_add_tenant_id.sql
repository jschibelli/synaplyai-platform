-- Add tenantId column with a default value
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT DEFAULT 'default-tenant';

-- Set default values for existing records
UPDATE "User" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;

-- Make the column required
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- Create index for better query performance
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");