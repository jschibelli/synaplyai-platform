import { MigrationInterface, QueryRunner } from "typeorm";

export class PartitionComplianceLogs1630000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create partitioning for next 6 months
        const now = new Date();
        
        for (let i = 0; i < 6; i++) {
            const month = new Date(now);
            month.setMonth(month.getMonth() + i);
            
            const nextMonth = new Date(month);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            
            const year = month.getFullYear();
            const monthNum = month.getMonth() + 1;
            const formattedMonth = monthNum.toString().padStart(2, '0');
            
            const partitionName = `ComplianceLog_${year}_${formattedMonth}`;
            const startDate = `${year}-${formattedMonth}-01`;
            const nextYear = nextMonth.getFullYear();
            const nextMonthNum = nextMonth.getMonth() + 1;
            const formattedNextMonth = nextMonthNum.toString().padStart(2, '0');
            const endDate = `${nextYear}-${formattedNextMonth}-01`;
            
            await queryRunner.query(`
                CREATE TABLE ${partitionName} PARTITION OF ComplianceLog
                FOR VALUES FROM ('${startDate}') TO ('${endDate}');
            `);
        }
        
        // Add index for faster validation queries
        await queryRunner.query(`
            CREATE INDEX idx_compliance_evidence_hash ON ComplianceLog(evidenceHash);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Cannot easily undo partitioning, but we can remove the evidence hash index
        await queryRunner.query(`
            DROP INDEX idx_compliance_evidence_hash;
        `);
    }
}