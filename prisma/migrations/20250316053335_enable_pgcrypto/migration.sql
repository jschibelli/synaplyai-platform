-- CreateTable
CREATE TABLE "compliance_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "filter_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_ip" TEXT,
    "user_id" TEXT,

    CONSTRAINT "compliance_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_log_tenant_id_idx" ON "compliance_log"("tenant_id");

-- CreateIndex
CREATE INDEX "compliance_log_created_at_idx" ON "compliance_log"("created_at");

-- CreateIndex
CREATE INDEX "compliance_log_event_type_idx" ON "compliance_log"("event_type");

-- AddForeignKey
ALTER TABLE "compliance_log" ADD CONSTRAINT "compliance_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
