import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateComplianceLogTable1620000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE ComplianceLog (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenantId VARCHAR NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL,
                eventType VARCHAR NOT NULL,
                details JSONB,
                evidenceHash VARCHAR,
                CONSTRAINT tenant_timestamp_idx UNIQUE (tenantId, timestamp)
            )
        `);

        await queryRunner.query(`
            CREATE INDEX idx_tenantId ON ComplianceLog (tenantId);
            CREATE INDEX idx_timestamp ON ComplianceLog (timestamp);
        `);

        await queryRunner.query(`
            CREATE TABLE ComplianceLog_2021_01 PARTITION OF ComplianceLog
            FOR VALUES FROM ('2021-01-01') TO ('2021-04-01');
            CREATE TABLE ComplianceLog_2021_04 PARTITION OF ComplianceLog
            FOR VALUES FROM ('2021-04-01') TO ('2021-07-01');
            -- Add more partitions as needed
        `);

        await queryRunner.query(`
            REVOKE UPDATE, DELETE ON ComplianceLog FROM PUBLIC;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE ComplianceLog CASCADE;`);
    }
}