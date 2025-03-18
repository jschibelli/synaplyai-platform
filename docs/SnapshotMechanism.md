# Snapshot Mechanism

## Overview

The Snapshot Mechanism is a performance optimization technique implemented for the SynaplyAI platform's event sourcing architecture. It addresses the challenge of efficiently reconstructing document state from potentially thousands of events by capturing and storing point-in-time document states at strategic intervals.

## Core Principles

1. **Adaptive Thresholding**: Snapshots are created based on intelligent analysis of document activity, size, and access patterns rather than fixed intervals.
2. **Tenant Isolation**: All snapshots maintain proper tenant boundaries to ensure complete multi-tenant isolation.
3. **Performance Optimization**: The mechanism dramatically reduces document reconstruction time for frequently accessed documents.
4. **Storage Efficiency**: Implements intelligent pruning to maintain optimal storage utilization.
5. **Caching Strategy**: Uses multi-tier caching to further improve performance.

## Architecture

The Snapshot Mechanism consists of these key components:

### SnapshotManager

The `SnapshotManager` orchestrates snapshot creation and retrieval with adaptive threshold management:

- Determines when snapshots should be created based on multiple heuristics
- Handles snapshot creation with proper tenant context
- Coordinates pruning of old snapshots
- Collects performance metrics for continuous optimization

### SnapshotStore

The `SnapshotStore` provides the persistence layer for snapshots:

- Stores snapshots with proper tenant isolation
- Implements efficient querying for latest and version-specific snapshots
- Provides caching mechanisms for frequently accessed snapshots
- Handles snapshot pruning based on configurable retention policies

### Adaptive Threshold Management

Snapshots are created based on these adaptive thresholds:

1. **Event Count Threshold**: Creates snapshots when sufficient events accumulate since the last snapshot
2. **Time-Based Threshold**: Creates snapshots when a significant time has passed since the last snapshot
3. **Access Frequency**: Creates more snapshots for frequently accessed documents
4. **Reconstruction Time**: Monitors document reconstruction time and creates snapshots when it exceeds target thresholds
5. **Document Size**: Adjusts thresholds based on document size and complexity

### Snapshot Creation Logic

```typescript
async shouldCreateSnapshot(documentId: DocumentId, tenantId: string): Promise<boolean> {
  // Get the latest snapshot and count of events since
  const latestSnapshot = await this.snapshotStore.getLatestSnapshot(documentId, tenantId);
  const lastVersion = latestSnapshot?.version || 0;
  
  // Count events since last snapshot
  const eventCount = await this.eventStore.getEventCountSinceVersion(
    documentId, 
    lastVersion,
    tenantId
  );
  
  // If below minimum threshold, don't create snapshot
  if (eventCount < this.config.minEventCount) {
    return false;
  }
  
  // If above maximum threshold, force snapshot
  if (eventCount > this.config.maxEventCount) {
    return true;
  }
  
  // Check time since last snapshot
  if (latestSnapshot) {
    const lastSnapshotTime = new Date(latestSnapshot.timestamp).getTime();
    const timeSinceLastSnapshot = Date.now() - lastSnapshotTime;
    
    if (timeSinceLastSnapshot < this.config.minTimeSinceLastSnapshot) {
      return false;
    }
  }
  
  // Check recent document reconstruction time
  const recentReconstructionTime = await this.metricsCollector.getAverageValue(
    `document.reconstruction.time.${documentId}`,
    { timeWindow: '1h' }
  );
  
  // If reconstruction is becoming slow, create snapshot more aggressively
  if (recentReconstructionTime && recentReconstructionTime > this.config.targetReconstructionTime) {
    return true;
  }
  
  // Check document access frequency
  const accessCount = await this.metricsCollector.getCountValue(
    `document.access.count.${documentId}`,
    { timeWindow: '24h' }
  );
  
  // Create more snapshots for frequently accessed documents
  if (accessCount && accessCount > 10) {
    return true;
  }
  
  return false;
}
```

### Snapshot Creation

```typescript
// Check if snapshot should be created
const shouldCreate = await snapshotManager.shouldCreateSnapshot(documentId, tenantId);

if (shouldCreate) {
  // Get current document state
  const documentState = await documentReconstructor.reconstructDocument(documentId, tenantId);
  
  // Create snapshot with current version
  await snapshotManager.createSnapshot(
    documentId,
    tenantId,
    documentState,
    currentVersion
  );
}
```

### Document Reconstruction

```typescript
async function reconstructDocument(documentId: string, tenantId: string): Promise<Document> {
  // Try to get the latest snapshot
  const snapshot = await snapshotManager.getLatestSnapshot(documentId, tenantId);
  
  let baseState;
  let startVersion = 0;
  
  if (snapshot) {
    // Use snapshot as base state
    baseState = snapshot.data;
    startVersion = snapshot.version;
  } else {
    // No snapshot, start with empty document
    baseState = createEmptyDocument();
  }
  
  // Get events after snapshot version
  const events = await eventStore.getEvents(documentId, tenantId, startVersion);
  
  // Apply events to reconstruct current state
  return events.reduce(applyEvent, baseState);
}
```

## Implementation Details

### Snapshot Storage

Snapshots are stored in a dedicated database table with these fields:

```sql
// Table structure
model Snapshot {
  id         String   @id @default(uuid())
  documentId String
  tenantId   String
  version    Int
  data       String   @db.Text
  metadata   String   @db.Text
  timestamp  DateTime @default(now())
  createdBy  String?

  @@index([documentId, tenantId])
  @@index([documentId, version])
  @@unique([documentId, tenantId, version])
}
```

### Snapshot Metadata

```typescript
// Snapshot metadata structure
interface SnapshotMetadata {
  version: number;
  documentId: string;
  timestamp: string;
  eventCount: number;
}
```

### Snapshot Configuration

```typescript
interface SnapshotConfig {
  minEventCount: number;            // Minimum events before considering a snapshot
  maxEventCount: number;            // Maximum events before forcing a snapshot
  minTimeSinceLastSnapshot: number; // Minimum ms between snapshots
  targetReconstructionTime: number; // Target document reconstruction time in ms
  compressionTarget: number;        // Target compression ratio
  keepVersions: number;             // Number of snapshot versions to retain
}
```