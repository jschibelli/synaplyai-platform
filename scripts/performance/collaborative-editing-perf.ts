import { performance } from 'perf_hooks';
import { Document, EventStore, SnapshotStore, ConflictResolver } from '../../src/collaborative';

async function runPerformanceTests() {
  const results: Record<string, PerformanceResult> = {};
  
  // Test document loading performance with various sizes
  results.smallDocLoad = await testDocumentLoading('small-doc-123', 50);  // ~50KB document
  results.mediumDocLoad = await testDocumentLoading('medium-doc-456', 500);  // ~500KB document
  results.largeDocLoad = await testDocumentLoading('large-doc-789', 2000);  // ~2MB document
  
  // Test conflict detection and resolution
  results.conflictDetection = await testConflictDetection(100);  // Run 100 conflict detection tests
  results.conflictResolution = await testConflictResolution(50);  // Run 50 conflict resolution tests
  
  // Test concurrent editing with multiple simulated users
  results.concurrentEditing = await testConcurrentEditing(10, 50);  // 10 users, 50 operations each
  
  // Output results
  console.table(Object.entries(results).map(([name, result]) => ({
    Test: name,
    'Avg (ms)': result.average.toFixed(2),
    'Min (ms)': result.min.toFixed(2),
    'Max (ms)': result.max.toFixed(2),
    'p95 (ms)': result.p95.toFixed(2),
    Samples: result.samples
  })));
  
  // Check against targets
  validateAgainstTargets(results);
}

// Helper functions for performance testing...