CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the ComplianceLog table with partitioning
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
) PARTITION BY RANGE (created_at);

-- Create initial partitions for current and next month
CREATE TABLE "compliance_log_2025_03" PARTITION OF "compliance_log" 
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE "compliance_log_2025_04" PARTITION OF "compliance_log" 
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

-- Create indexes
CREATE INDEX "compliance_log_tenant_id_idx" ON "compliance_log"("tenant_id");
CREATE INDEX "compliance_log_created_at_idx" ON "compliance_log"("created_at");
CREATE INDEX "compliance_log_event_type_idx" ON "compliance_log"("event_type");

-- Set permissions to ensure immutability
REVOKE UPDATE, DELETE ON "compliance_log" FROM PUBLIC;
GRANT INSERT ON "compliance_log" TO application_role;
GRANT SELECT ON "compliance_log" TO application_role;

-- Add audit trigger for compliance
CREATE OR REPLACE FUNCTION log_compliance_audit()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "ComplianceAudit" (
        operation, table_name, record_id, changed_by, changed_at, old_values, new_values
    ) VALUES (
        TG_OP,
        TG_TABLE_NAME,
        NEW.id,
        current_user,
        current_timestamp,
        row_to_json(OLD),
        row_to_json(NEW)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;