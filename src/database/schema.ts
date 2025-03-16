import { Table, Column, Model, DataType } from 'sequelize-typescript';
import { Prisma } from '@prisma/client';

@Table({
  tableName: 'ComplianceLog',
  timestamps: false,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['timestamp'] }
  ]
})
export class ComplianceLog extends Model<ComplianceLog> {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    allowNull: false
  })
  id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  tenantId!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false
  })
  timestamp!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  eventType!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false
  })
  details!: object;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  evidenceHash!: string;
}

export default async function(prisma: Prisma.TransactionClient) {
  // Create the partitioned table
  await prisma.$executeRaw`
    CREATE TABLE "ComplianceLog" (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB,
      filter_result JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      source_ip TEXT,
      user_id TEXT
    ) PARTITION BY RANGE (created_at);
  `;
  
  // Create initial partitions (monthly)
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  await prisma.$executeRaw`
    CREATE TABLE "ComplianceLog_${now.getFullYear()}_${now.getMonth() + 1}" 
    PARTITION OF "ComplianceLog" 
    FOR VALUES FROM ('${now.toISOString()}') TO ('${nextMonth.toISOString()}');
  `;
  
  // Create indexes
  await prisma.$executeRaw`
    CREATE INDEX idx_compliance_log_tenant_id ON "ComplianceLog" (tenant_id);
    CREATE INDEX idx_compliance_log_created_at ON "ComplianceLog" (created_at);
    CREATE INDEX idx_compliance_log_event_type ON "ComplianceLog" (event_type);
  `;
  
  // Enforce immutability through REVOKE
  await prisma.$executeRaw`
    REVOKE UPDATE, DELETE ON "ComplianceLog" FROM PUBLIC, postgres;
  `;
}