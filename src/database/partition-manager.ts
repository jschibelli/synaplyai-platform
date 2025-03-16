import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createNextPartition() {
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
  
  try {
    // Check if partition already exists
    const checkResult = await prisma.$queryRaw`
      SELECT 1 FROM pg_tables WHERE tablename = ${partitionName}
    `;
    
    if (Array.isArray(checkResult) && checkResult.length > 0) {
      console.log(`Partition ${partitionName} already exists, skipping creation.`);
      return;
    }
    
    // Create the partition
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${partitionName}" 
      PARTITION OF "compliance_log" 
      FOR VALUES FROM ('${startDate}') TO ('${endDate}')
    `);
    
    console.log(`Created partition ${partitionName} for period ${startDate} to ${endDate}`);
  } catch (error) {
    console.error('Error creating partition:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
createNextPartition().catch(console.error);