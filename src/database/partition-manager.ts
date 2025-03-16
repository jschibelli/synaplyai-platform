import { prisma } from '../prisma/client';
import { ComplianceLogger } from '../compliance/logger';

export class PartitionManager {
  /**
   * Creates a new partition for the compliance logs table for the next month
   */
  static async createNextPartition(): Promise<void> {
    try {
      // Calculate the month after next
      const now = new Date();
      let nextMonth = now.getMonth() + 2; // +2 for the month after next
      let nextYear = now.getFullYear();
      
      if (nextMonth > 11) {
        nextMonth -= 12;
        nextYear += 1;
      }
      
      // Format dates
      const nextMonthFormatted = (nextMonth + 1).toString().padStart(2, '0');
      
      let followingMonth = nextMonth + 1;
      let followingYear = nextYear;
      if (followingMonth > 11) {
        followingMonth -= 12;
        followingYear += 1;
      }
      const followingMonthFormatted = (followingMonth + 1).toString().padStart(2, '0');
      
      const partitionName = `compliance_log_${nextYear}_${nextMonthFormatted}`;
      const startDate = `${nextYear}-${nextMonthFormatted}-01`;
      const endDate = `${followingYear}-${followingMonthFormatted}-01`;
      
      // Create the partition
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "${partitionName}" 
        PARTITION OF "ComplianceLog" 
        FOR VALUES FROM ('${startDate}') TO ('${endDate}');
      `;
      
      console.log(`Created new partition: ${partitionName}`);
      
      await ComplianceLogger.log({
        eventType: 'system.partition.created',
        description: `Created new compliance log partition: ${partitionName}`,
        metadata: {
          partitionName,
          startDate,
          endDate
        }
      });
    } catch (error) {
      console.error('Failed to create new partition:', error);
    }
  }
  
  /**
   * Schedule the creation of new partitions on a monthly basis
   */
  static schedulePartitionCreation(): void {
    // Run immediately once
    this.createNextPartition();
    
    // Schedule to run on the 15th of each month
    const now = new Date();
    const nextRun = new Date(now.getFullYear(), now.getMonth(), 15);
    
    if (now.getDate() > 15) {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }
    
    const timeUntilNextRun = nextRun.getTime() - now.getTime();
    
    setTimeout(() => {
      this.createNextPartition();
      
      // Then schedule monthly execution
      setInterval(() => {
        this.createNextPartition();
      }, 30 * 24 * 60 * 60 * 1000); // Approximately 30 days
    }, timeUntilNextRun);
  }
}