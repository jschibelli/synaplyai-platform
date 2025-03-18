/*
  Warnings:

  - You are about to drop the `compliance_log` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "compliance_log" DROP CONSTRAINT "compliance_log_user_id_fkey";

-- DropTable
DROP TABLE "compliance_log";

-- CreateTable
CREATE TABLE "ComplianceLog" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceId" TEXT,
    "userId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceLog_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceLog_tenantId_idx" ON "ComplianceLog"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceLog_eventType_idx" ON "ComplianceLog"("eventType");

-- CreateIndex
CREATE INDEX "ComplianceLog_resourceId_idx" ON "ComplianceLog"("resourceId");

-- CreateIndex
CREATE INDEX "ComplianceLog_userId_idx" ON "ComplianceLog"("userId");

-- CreateIndex
CREATE INDEX "ComplianceLog_createdAt_idx" ON "ComplianceLog"("createdAt");

-- CreateIndex
CREATE INDEX "Snapshot_documentId_tenantId_idx" ON "Snapshot"("documentId", "tenantId");

-- CreateIndex
CREATE INDEX "Snapshot_documentId_version_idx" ON "Snapshot"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_documentId_tenantId_version_key" ON "Snapshot"("documentId", "tenantId", "version");

-- AddForeignKey
ALTER TABLE "ComplianceLog" ADD CONSTRAINT "ComplianceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
