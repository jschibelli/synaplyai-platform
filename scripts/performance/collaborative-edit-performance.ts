import { performance } from 'perf_hooks';
import { VectorClock } from '../../src/collaborative/VectorClock';
import { OperationalTransform, Operation } from '../../src/collaborative/OperationalTransform';

async function runPerformanceTests() {
  console.log('Starting collaborative editing performance tests...');
  
  // Test 1: Vector clock comparison performance
  const clockComparisonTimes: number[] = [];
  const trials = 10000;
  
  for (let i = 0; i < trials; i++) {
    const clock1 = createRandomVectorClock(10); // 10 users
    const clock2 = createRandomVectorClock(10);
    
    const start = performance.now();
    clock1.compare(clock2);
    const end = performance.now();
    
    clockComparisonTimes.push(end - start);
  }
  
  // Test 2: Operation transform performance
  const transformTimes: number[] = [];
  for (let i = 0; i < trials; i++) {
    const op1 = createRandomOperation();
    const op2 = createRandomOperation();
    
    const start = performance.now();
    OperationalTransform.transform(op1, op2);
    const end = performance.now();
    
    transformTimes.push(end - start);
  }
  
  // Test 3: Conflict detection performance
  const conflictDetectionTimes: number[] = [];
  for (let i = 0; i < trials; i++) {
    const op1 = createRandomOperation();
    const op2 = createRandomOperation();
    const clock1 = createRandomVectorClock(5);
    const clock2 = createRandomVectorClock(5);
    
    const start = performance.now();
    // Basic conflict detection: check if operations are concurrent AND affect the same region
    const areConcurrent = clock1.compare(clock2) === 0;
    const regionsOverlap = operationsOverlap(op1, op2);
    const conflict = areConcurrent && regionsOverlap;
    const end = performance.now();
    
    conflictDetectionTimes.push(end - start);
  }
  
  // Output results
  console.log('Vector Clock Comparison Performance:');
  console.log(`  Average: ${average(clockComparisonTimes).toFixed(3)} ms`);
  console.log(`  95th percentile: ${percentile(clockComparisonTimes, 95).toFixed(3)} ms`);
  console.log(`  Max: ${Math.max(...clockComparisonTimes).toFixed(3)} ms`);
  
  console.log('Operation Transform Performance:');
  console.log(`  Average: ${average(transformTimes).toFixed(3)} ms`);
  console.log(`  95th percentile: ${percentile(transformTimes, 95).toFixed(3)} ms`);
  console.log(`  Max: ${Math.max(...transformTimes).toFixed(3)} ms`);
  
  console.log('Conflict Detection Performance:');
  console.log(`  Average: ${average(conflictDetectionTimes).toFixed(3)} ms`);
  console.log(`  95th percentile: ${percentile(conflictDetectionTimes, 95).toFixed(3)} ms`);
  console.log(`  Max: ${Math.max(...conflictDetectionTimes).toFixed(3)} ms`);
  
  // Check if we meet performance targets
  const targetConflictDetection = 5; // ms
  const p95ConflictDetection = percentile(conflictDetectionTimes, 95);
  console.log(`Conflict Detection target: <${targetConflictDetection}ms, actual: ${p95ConflictDetection.toFixed(3)}ms`);
  console.log(`Performance target met: ${p95ConflictDetection < targetConflictDetection ? 'YES ✓' : 'NO ✗'}`);
}

// Helper functions
function average(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * (p / 100);
  const base = Math.floor(pos);
  const rest = pos - base;
  
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

function createRandomVectorClock(userCount: number): VectorClock {
  const clock = new VectorClock();
  for (let i = 0; i < userCount; i++) {
    const userId = `user-${i}`;
    const count = Math.floor(Math.random() * 10) + 1;
    for (let j = 0; j < count; j++) {
      clock.increment(userId);
    }
  }
  return clock;
}

function createRandomOperation(): Operation {
  const types = ['insert', 'delete', 'replace'];
  const type = types[Math.floor(Math.random() * types.length)] as 'insert' | 'delete' | 'replace';
  const position = Math.floor(Math.random() * 1000);
  const userId = `user-${Math.floor(Math.random() * 10)}`;
  const timestamp = Date.now();
  
  if (type === 'insert') {
    return {
      type,
      position,
      text: generateRandomText(Math.floor(Math.random() * 20) + 1),
      userId,
      timestamp
    };
  } else if (type === 'delete') {
    return {
      type,
      position,
      length: Math.floor(Math.random() * 20) + 1,
      userId,
      timestamp
    };
  } else {
    return {
      type,
      position,
      length: Math.floor(Math.random() * 20) + 1,
      text: generateRandomText(Math.floor(Math.random() * 20) + 1),
      userId,
      timestamp
    };
  }
}

function generateRandomText(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function operationsOverlap(a: Operation, b: Operation): boolean {
  // Simple overlap detection based on positions and lengths
  if (a.type === 'insert') {
    if (b.type === 'insert') {
      return a.position === b.position;
    } else {
      return a.position >= b.position && a.position <= b.position + (b.type === 'delete' || b.type === 'replace' ? b.length : 0);
    }
  } else if (a.type === 'delete' || a.type === 'replace') {
    if (b.type === 'insert') {
      return b.position >= a.position && b.position <= a.position + a.length;
    } else {
      return (
        (a.position >= b.position && a.position < b.position + b.length) || 
        (b.position >= a.position && b.position < a.position + a.length)
      );
    }
  }
  return false;
}

runPerformanceTests().catch(console.error);