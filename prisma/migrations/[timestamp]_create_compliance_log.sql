CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the ComplianceLog table with partitioning
CREATE TABLE "ComplianceLog" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "resourceId" TEXT,
  "userId" TEXT,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplianceLog_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE (createdAt);

-- Create index for faster filtering by tenant
CREATE INDEX "ComplianceLog_tenantId_idx" ON "ComplianceLog"("tenantId");
-- Create index for filtering by event type
CREATE INDEX "ComplianceLog_eventType_idx" ON "ComplianceLog"("eventType");
-- Create index for filtering by resource
CREATE INDEX "ComplianceLog_resourceId_idx" ON "ComplianceLog"("resourceId");
-- Create index for filtering by user
CREATE INDEX "ComplianceLog_userId_idx" ON "ComplianceLog"("userId");
-- Create index for date ranges
CREATE INDEX "ComplianceLog_createdAt_idx" ON "ComplianceLog"("createdAt");

-- Create partitions for the current month and next month
CREATE TABLE "ComplianceLog_current_month" PARTITION OF "ComplianceLog"
  FOR VALUES FROM (date_trunc('month', CURRENT_DATE)) 
  TO (date_trunc('month', CURRENT_DATE + interval '1 month'));

CREATE TABLE "ComplianceLog_next_month" PARTITION OF "ComplianceLog"
  FOR VALUES FROM (date_trunc('month', CURRENT_DATE + interval '1 month')) 
  TO (date_trunc('month', CURRENT_DATE + interval '2 month'));

-- Create a function to maintain future partitions
CREATE OR REPLACE FUNCTION maintain_compliance_log_partitions()
RETURNS void AS $$
DECLARE
  current_date date := CURRENT_DATE;
  partition_date date;
  partition_name text;
  start_date text;
  end_date text;
BEGIN
  -- Loop to create partitions for next 6 months
  FOR i IN 0..5 LOOP
    partition_date := date_trunc('month', current_date + (i || ' month')::interval);
    partition_name := 'ComplianceLog_y' || to_char(partition_date, 'YYYY') || 'm' || to_char(partition_date, 'MM');
    start_date := to_char(partition_date, 'YYYY-MM-DD');
    end_date := to_char(partition_date + '1 month'::interval, 'YYYY-MM-DD');
    
    -- Check if partition exists
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = partition_name
    ) THEN
      -- Create the partition
      EXECUTE format('
        CREATE TABLE %I PARTITION OF "ComplianceLog"
        FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
      );
      
      -- REVOKE permissions to ensure immutability
      EXECUTE format('
        REVOKE ALL ON %I FROM public;
        REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM current_user;',
        partition_name, partition_name
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create a function to trigger on delete attempts (enforce immutability)
CREATE OR REPLACE FUNCTION prevent_compliance_log_changes()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Compliance logs are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

-- Create triggers on the parent table to prevent deletion/updates
CREATE TRIGGER prevent_compliance_log_updates
  BEFORE UPDATE ON "ComplianceLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_compliance_log_changes();

CREATE TRIGGER prevent_compliance_log_deletes
  BEFORE DELETE ON "ComplianceLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_compliance_log_changes();

-- Execute the partition maintenance function
SELECT maintain_compliance_log_partitions();

-- Create a scheduled job to maintain partitions monthly
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('0 0 1 * *', 'SELECT maintain_compliance_log_partitions()');

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