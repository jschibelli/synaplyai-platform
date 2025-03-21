// filepath: d:\ai-dev-projects\ai-create-assistant\scripts\performance\conflict-resolution-perf.ts
import { performance } from 'perf_hooks';
import { simulateEditing, simulateCollaboration, measureLatency } from './test-utils';

async function runPerformanceTests() {
  console.log('Starting conflict resolution performance tests...');

  // Test 1: Measure conflict detection time
  const detectionTimes = [];
  for (let i = 0; i < 100; i++) {
    const { users, document } = await simulateCollaboration({ 
      userCount: 10, 
      editOperations: 500,
      concurrentEdits: true
    });
    
    const start = performance.now();
    const conflicts = await document.detectConflicts();
    const end = performance.now();
    
    detectionTimes.push(end - start);
  }

  // Test 2: Measure conflict resolution UI response time
  const uiResponseTimes = [];
  for (let i = 0; i < 100; i++) {
    const { conflicts, ui } = await simulateEditing({
      conflictCount: 5,
      documentSize: 'large' // 100KB document
    });
    
    const measurements = await measureLatency(() => {
      ui.renderConflictPanel(conflicts[0]);
    });
    
    uiResponseTimes.push(measurements.renderTime);
  }

  // Test 3: Measure sync latency during concurrent editing
  const syncLatencies = [];
  for (let i = 0; i < 50; i++) {
    const { users } = await simulateCollaboration({
      userCount: 20,
      editFrequency: 'high', // 10 edits per second
      duration: 60 // 1 minute test
    });
    
    syncLatencies.push(...users.map(u => u.syncLatencies).flat());
  }

  // Output results
  console.log('Conflict Detection Time (ms):');
  console.log(`  Avg: ${average(detectionTimes)}`);
  console.log(`  95th: ${percentile(detectionTimes, 95)}`);
  console.log(`  Max: ${Math.max(...detectionTimes)}`);

  console.log('UI Response Time (ms):');
  console.log(`  Avg: ${average(uiResponseTimes)}`);
  console.log(`  95th: ${percentile(uiResponseTimes, 95)}`);
  console.log(`  Max: ${Math.max(...uiResponseTimes)}`);

  console.log('Sync Latency (ms):');
  console.log(`  Avg: ${average(syncLatencies)}`);
  console.log(`  95th: ${percentile(syncLatencies, 95)}`);
  console.log(`  Max: ${Math.max(...syncLatencies)}`);
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

runPerformanceTests().catch(console.error);