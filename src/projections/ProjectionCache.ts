import { getTenantContext } from '../lib/tenant-context';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/metrics-collector';
import { BaseEvent, EventStore } from '../events/EventStore';
import Redis from 'ioredis';
import { prisma } from '../prisma/client';

/**
 * Cache tier levels
 */
export enum CacheTier {
  /** In-memory cache (fastest, limited capacity) */
  MEMORY = 'memory',
  /** Redis cache (medium speed, larger capacity) */
  REDIS = 'redis',
  /** Persistent PostgreSQL cache (slower, unlimited capacity) */
  POSTGRES = 'postgres'
}

/**
 * Cache hit result with source information
 */
export interface CacheResult<T> {
  /** Whether the data was found in cache */
  hit: boolean;
  /** Which cache tier the data was found in */
  tier?: CacheTier;
  /** The cached data (if hit is true) */
  data?: T;
  /** Time taken to retrieve the data in ms */
  retrievalTimeMs: number;
}

/**
 * Document section information
 */
export interface DocumentSection {
  /** Section identifier */
  id: string;
  /** Document identifier */
  documentId: string;
  /** Title of the section */
  title: string;
  /** Section content */
  content: string;
  /** Start position in document */
  startPosition: number;
  /** End position in document */
  endPosition: number;
  /** Whether this section has been prefetched */
  prefetched: boolean;
}

/**
 * Document structure without full content
 */
export interface DocumentStructure {
  /** Document identifier */
  id: string;
  /** Document title */
  title: string;
  /** Document metadata */
  metadata: Record<string, any>;
  /** Total number of sections */
  sectionCount: number;
  /** Total document length */
  totalLength: number;
  /** References to sections */
  sections: Array<{
    id: string;
    title: string;
    startPosition: number;
    endPosition: number;
  }>;
  /** Version of the document */
  version: number;
}

/**
 * Complete document with all content
 */
export interface DocumentProjection {
  /** Document identifier */
  id: string;
  /** Document title */
  title: string;
  /** Document metadata */
  metadata: Record<string, any>;
  /** Full document content */
  content: string;
  /** Complete sections with content */
  sections: DocumentSection[];
  /** Version of the document */
  version: number;
  /** Timestamp when the document was last modified */
  lastModified: string;
}

/**
 * User behavior data for prefetching decisions
 */
export interface UserBehavior {
  /** User identifier */
  userId: string;
  /** Document identifier */
  documentId: string;
  /** Sections the user has viewed */
  viewedSections: string[];
  /** Number of times each section was viewed */
  sectionViewCount: Record<string, number>;
  /** Last viewed position */
  lastPosition: number;
  /** Last activity timestamp */
  lastActivity: string;
}

/**
 * Configuration for the projection cache
 */
export interface ProjectionCacheConfig {
  /** Maximum items in memory cache */
  memoryCacheSize: number;
  /** TTL for memory cache items in seconds */
  memoryCacheTtlSeconds: number;
  /** TTL for Redis cache items in seconds */
  redisCacheTtlSeconds: number;
  /** Whether to enable predictive prefetching */
  enablePrefetching: boolean;
  /** Sections to prefetch ahead */
  prefetchSectionCount: number;
  /** Maximum concurrent prefetch operations */
  maxConcurrentPrefetches: number;
  /** Whether to log cache operations for analysis */
  logCacheOperations: boolean;
}

/**
 * Three-tier caching system for document projections with 
 * progressive loading and predictive prefetching
 */
export class ProjectionCache {
  private config: ProjectionCacheConfig;
  private eventStore: EventStore;
  private redisClient: Redis;
  private metricsCollector: MetricsCollector;
  private memoryCache = new Map<string, { data: any; expires: number }>();
  private prefetchQueue = new Set<string>();
  private userBehaviorCache = new Map<string, UserBehavior>();
  
  /**
   * Create a new projection cache
   * @param eventStore Event store for accessing document events
   * @param redisClient Redis client for caching
   * @param metricsCollector Metrics collector for monitoring
   * @param config Cache configuration
   */
  constructor(
    eventStore: EventStore,
    redisClient: Redis,
    metricsCollector: MetricsCollector,
    config: Partial<ProjectionCacheConfig> = {}
  ) {
    this.eventStore = eventStore;
    this.redisClient = redisClient;
    this.metricsCollector = metricsCollector;
    
    this.config = {
      memoryCacheSize: 100,
      memoryCacheTtlSeconds: 300, // 5 minutes
      redisCacheTtlSeconds: 3600, // 1 hour
      enablePrefetching: true,
      prefetchSectionCount: 2,
      maxConcurrentPrefetches: 3,
      logCacheOperations: true,
      ...config
    };
    
    // Start periodic cleaning of memory cache
    setInterval(() => this.cleanMemoryCache(), 60_000); // Every minute
  }
  
  /**
   * Get document structure (without full content) from cache or rebuild
   * @param documentId Document identifier
   * @returns Document structure
   */
  async getDocumentStructure(documentId: string): Promise<DocumentStructure> {
    const startTime = Date.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get document structure: No tenant context available');
    }
    
    const cacheKey = `doc:structure:${tenantContext.tenantId}:${documentId}`;
    
    try {
      // Try to get from cache
      const cacheResult = await this.getCached<DocumentStructure>(cacheKey);
      
      if (cacheResult.hit && cacheResult.data) {
        await this.metricsCollector.incrementCounter('cache.structure.hit', {
          tier: cacheResult.tier!,
          tenantId: tenantContext.tenantId
        });
        
        return cacheResult.data;
      }
      
      // Not in cache, rebuild from events
      const structure = await this.buildDocumentStructure(documentId);
      
      // Cache the result
      await this.setCached(cacheKey, structure);
      
      await this.metricsCollector.incrementCounter('cache.structure.miss', {
        tenantId: tenantContext.tenantId
      });
      
      return structure;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.structure.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Get a document section from cache or rebuild
   * @param documentId Document identifier
   * @param sectionId Section identifier
   * @returns Document section
   */
  async getDocumentSection(documentId: string, sectionId: string): Promise<DocumentSection> {
    const startTime = Date.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get document section: No tenant context available');
    }
    
    const cacheKey = `doc:section:${tenantContext.tenantId}:${documentId}:${sectionId}`;
    
    try {
      // Try to get from cache
      const cacheResult = await this.getCached<DocumentSection>(cacheKey);
      
      if (cacheResult.hit && cacheResult.data) {
        await this.metricsCollector.incrementCounter('cache.section.hit', {
          tier: cacheResult.tier!,
          tenantId: tenantContext.tenantId
        });
        
        // Record this section view for prefetching decisions
        if (tenantContext.userId) {
          await this.recordSectionView(
            tenantContext.userId,
            documentId,
            sectionId
          );
        }
        
        return cacheResult.data;
      }
      
      // Not in cache, rebuild from events
      const section = await this.buildDocumentSection(documentId, sectionId);
      
      // Cache the result
      await this.setCached(cacheKey, section);
      
      await this.metricsCollector.incrementCounter('cache.section.miss', {
        tenantId: tenantContext.tenantId
      });
      
      // Record this section view for prefetching decisions
      if (tenantContext.userId) {
        await this.recordSectionView(
          tenantContext.userId,
          documentId,
          sectionId
        );
      }
      
      // Trigger prefetching of nearby sections
      if (this.config.enablePrefetching && tenantContext.userId) {
        this.prefetchNearbySections(tenantContext.userId, documentId, sectionId);
      }
      
      return section;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.section.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Get complete document projection from cache or rebuild
   * @param documentId Document identifier
   * @returns Complete document projection
   */
  async getDocumentProjection(documentId: string): Promise<DocumentProjection> {
    const startTime = Date.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get document projection: No tenant context available');
    }
    
    const cacheKey = `doc:projection:${tenantContext.tenantId}:${documentId}`;
    
    try {
      // Try to get from cache
      const cacheResult = await this.getCached<DocumentProjection>(cacheKey);
      
      if (cacheResult.hit && cacheResult.data) {
        await this.metricsCollector.incrementCounter('cache.projection.hit', {
          tier: cacheResult.tier!,
          tenantId: tenantContext.tenantId
        });
        
        return cacheResult.data;
      }
      
      // Not in cache, build projection progressively
      
      // 1. Get structure first (fast)
      const structure = await this.getDocumentStructure(documentId);
      
      // 2. Get all sections in parallel
      const sectionPromises = structure.sections.map(section => 
        this.getDocumentSection(documentId, section.id)
      );
      
      const sections = await Promise.all(sectionPromises);
      
      // 3. Assemble complete projection
      const fullContent = sections
        .sort((a, b) => a.startPosition - b.startPosition)
        .map(s => s.content)
        .join('');
      
      const projection: DocumentProjection = {
        id: structure.id,
        title: structure.title,
        metadata: structure.metadata,
        content: fullContent,
        sections,
        version: structure.version,
        lastModified: new Date().toISOString()
      };
      
      // Cache the result
      await this.setCached(cacheKey, projection);
      
      await this.metricsCollector.incrementCounter('cache.projection.miss', {
        tenantId: tenantContext.tenantId
      });
      
      return projection;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.projection.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Rebuild a document projection using events
   * @param documentId Document identifier
   * @param targetVersion Target version to build (defaults to latest)
   * @returns Document projection
   */
  async rebuildProjection(documentId: string, targetVersion?: number): Promise<DocumentProjection> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot rebuild projection: No tenant context available');
    }
    
    const startTime = Date.now();
    
    try {
      // Get all events for the document
      const events = await this.eventStore.getEvents<BaseEvent>(documentId, 1, targetVersion);
      
      if (events.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }
      
      // Build projection from events
      const projection = this.buildProjectionFromEvents(events);
      
      // Update the cache with the new projection
      await this.invalidateDocumentCache(documentId);
      
      // Re-cache the structure and projection
      const structureKey = `doc:structure:${tenantContext.tenantId}:${documentId}`;
      const projectionKey = `doc:projection:${tenantContext.tenantId}:${documentId}`;
      
      const structure: DocumentStructure = {
        id: projection.id,
        title: projection.title,
        metadata: projection.metadata,
        sectionCount: projection.sections.length,
        totalLength: projection.content.length,
        sections: projection.sections.map(s => ({
          id: s.id,
          title: s.title,
          startPosition: s.startPosition,
          endPosition: s.endPosition
        })),
        version: projection.version
      };
      
      await this.setCached(structureKey, structure);
      await this.setCached(projectionKey, projection);
      
      // Cache each section separately
      for (const section of projection.sections) {
        const sectionKey = `doc:section:${tenantContext.tenantId}:${documentId}:${section.id}`;
        await this.setCached(sectionKey, section);
      }
      
      // Record rebuild metrics
      await this.metricsCollector.incrementCounter('cache.projection.rebuild', {
        tenantId: tenantContext.tenantId
      });
      
      return projection;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.projection.rebuild.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Invalidate all cached data for a document
   * @param documentId Document identifier
   */
  async invalidateDocumentCache(documentId: string): Promise<void> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot invalidate cache: No tenant context available');
    }
    
    const tenantId = tenantContext.tenantId;
    
    // Clear from memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(`:${tenantId}:${documentId}:`)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear from Redis cache
    const redisKeys = await this.redisClient.keys(`doc:*:${tenantId}:${documentId}*`);
    if (redisKeys.length > 0) {
      await this.redisClient.del(...redisKeys);
    }
    
    // Clear from Postgres cache
    await prisma.documentCache.deleteMany({
      where: {
        documentId,
        tenantId
      }
    });
    
    // Log invalidation
    if (this.config.logCacheOperations) {
      await ComplianceLogger.log({
        eventType: 'cache.invalidated',
        resourceId: documentId,
        description: `Cache invalidated for document ${documentId}`,
        metadata: {
          tenantId
        }
      });
    }
    
    await this.metricsCollector.incrementCounter('cache.invalidated', {
      tenantId
    });
  }
  
  /**
   * Update the cache when new events are applied
   * @param documentId Document identifier
   * @param events New events that were applied
   */
  async updateCacheWithEvents(documentId: string, events: BaseEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update cache: No tenant context available');
    }
    
    // For now, just invalidate and rebuild on next request
    // In a real implementation, we could apply the events to the cached projection
    await this.invalidateDocumentCache(documentId);
    
    // Optionally rebuild right away
    // await this.rebuildProjection(documentId);
  }
  
  /**
   * Get data from cache (checking all tiers)
   * @param key Cache key
   * @returns Cache result
   * @private
   */
  private async getCached<T>(key: string): Promise<CacheResult<T>> {
    const startTime = Date.now();
    
    // 1. Check memory cache first (fastest)
    const memoryCacheEntry = this.memoryCache.get(key);
    
    if (memoryCacheEntry && memoryCacheEntry.expires > Date.now()) {
      return {
        hit: true,
        tier: CacheTier.MEMORY,
        data: memoryCacheEntry.data as T,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    // 2. Check Redis cache next
    const redisResult = await this.redisClient.get(key);
    
    if (redisResult) {
      const data = JSON.parse(redisResult) as T;
      
      // Store in memory cache for future access
      this.setMemoryCache(key, data);
      
      return {
        hit: true,
        tier: CacheTier.REDIS,
        data,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    // 3. Check Postgres cache as last resort
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      return {
        hit: false,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    const [, docType, , docId, sectionId] = key.split(':');
    
    const postgresResult = await prisma.documentCache.findFirst({
      where: {
        tenantId: tenantContext.tenantId,
        documentId: docId,
        type: docType,
        ...(sectionId ? { sectionId } : {})
      }
    });
    
    if (postgresResult) {
      const data = JSON.parse(postgresResult.data) as T;
      
      // Store in Redis for future access
      await this.redisClient.set(
        key, 
        JSON.stringify(data), 
        'EX', 
        this.config.redisCacheTtlSeconds
      );
      
      // Store in memory cache for future access
      this.setMemoryCache(key, data);
      
      return {
        hit: true,
        tier: CacheTier.POSTGRES,
        data,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    // Not found in any cache
    return {
      hit: false,
      retrievalTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Set data in all cache tiers
   * @param key Cache key
   * @param data Data to cache
   * @private
   */
  private async setCached<T>(key: string, data: T): Promise<void> {
    // Extract document and section IDs from the key
    const [, docType, tenantId, docId, sectionId] = key.split(':');
    
    // 1. Set in memory cache
    this.setMemoryCache(key, data);
    
    // 2. Set in Redis cache
    await this.redisClient.set(
      key, 
      JSON.stringify(data), 
      'EX', 
      this.config.redisCacheTtlSeconds
    );
    
    // 3. Set in Postgres cache
    await prisma.documentCache.upsert({
      where: {
        tenantId_documentId_type_sectionId: {
          tenantId,
          documentId: docId,
          type: docType,
          sectionId: sectionId || ''
        }
      },
      update: {
        data: JSON.stringify(data),
        updatedAt: new Date()
      },
      create: {
        tenantId,
        documentId: docId,
        type: docType,
        sectionId: sectionId || '',
        data: JSON.stringify(data)
      }
    });
  }
  
  /**
   * Set data in memory cache
   * @param key Cache key
   * @param data Data to cache
   * @private
   */
  private setMemoryCache<T>(key: string, data: T): void {
    // Ensure we don't exceed the memory cache size
    if (this.memoryCache.size >= this.config.memoryCacheSize) {
      const keysIterator = this.memoryCache.keys();
      const oldestKey = keysIterator.next().value;
      this.memoryCache.delete(oldestKey);
    }
    
    // Set in memory cache with expiration
    this.memoryCache.set(key, {
      data,
      expires: Date.now() + (this.config.memoryCacheTtlSeconds * 1000)
    });
  }
  
  /**
   * Clean expired entries from memory cache
   * @private
   */
  private cleanMemoryCache(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires < now) {
        this.memoryCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0 && this.config.logCacheOperations) {
      console.log(`Cleaned ${expiredCount} expired entries from memory cache`);
    }
  }
  
  /**
   * Build document structure from events
   * @param documentId Document identifier
   * @returns Document structure
   * @private
   */
  private async buildDocumentStructure(documentId: string): Promise<DocumentStructure> {
    // In a real implementation, this would reconstruct the structure from events
    // For this example, we'll simulate it
    
    // Get current document version
    const currentVersion = await this.eventStore.getCurrentVersion(documentId);
    
    // Generate document structure
    const structure: DocumentStructure = {
      id: documentId,
      title: `Document ${documentId}`,
      metadata: { version: currentVersion },
      sectionCount: 3, // Example
      totalLength: 1000, // Example
      sections: [
        { id: 'section-1', title: 'Introduction', startPosition: 0, endPosition: 200 },
        { id: 'section-2', title: 'Main Content', startPosition: 200, endPosition: 800 },
        { id: 'section-3', title: 'Conclusion', startPosition: 800, endPosition: 1000 }
      ],
      version: currentVersion
    };
    
    return structure;
  }
  
  /**
   * Build a document section from events
   * @param documentId Document identifier
   * @param sectionId Section identifier
   * @returns Document section
   * @private
   */
  private async buildDocumentSection(documentId: string, sectionId: string): Promise<DocumentSection> {
    // In a real implementation, this would reconstruct the section from events
    // For this example, we'll simulate it
    
    const structure = await this.getDocumentStructure(documentId);
    const sectionInfo = structure.sections.find(s => s.id === sectionId);
    
    if (!sectionInfo) {
      throw new Error(`Section ${sectionId} not found in document ${documentId}`);
    }
    
    // Simulate section content
    const content = `Content for section ${sectionId} of document ${documentId}...`;
    
    return {
      id: sectionId,
      documentId,
      title: sectionInfo.title,
      content,
      startPosition: sectionInfo.startPosition,
      endPosition: sectionInfo.endPosition,
      prefetched: false
    };
  }
  
  /**
   * Build a complete document projection from events
   * @param events Document events
   * @returns Document projection
   * @private
   */
  private buildProjectionFromEvents(events: BaseEvent[]): DocumentProjection {
    // In a real implementation, this would reconstruct the document state
    // by replaying all events in sequence
    // For this example, we'll simulate it
    
    if (events.length === 0) {
      throw new Error('No events provided to build projection');
    }
    
    const documentId = events[0].aggregateId;
    const version = events[events.length - 1].aggregateVersion;
    
    // Simulate building projection
    const sections: DocumentSection[] = [
      {
        id: 'section-1',
        documentId,
        title: 'Introduction',
        content: 'Introduction content...',
        startPosition: 0,
        endPosition: 200,
        prefetched: false
      },
      {
        id: 'section-2',
        documentId,
        title: 'Main Content',
        content: 'Main content...',
        startPosition: 200,
        endPosition: 800,
        prefetched: false
      },
      {
        id: 'section-3',
        documentId,
        title: 'Conclusion',
        content: 'Conclusion content...',
        startPosition: 800,
        endPosition: 1000,
        prefetched: false
      }
    ];
    
    const fullContent = sections.map(s => s.content).join('\n\n');
    
    return {
      id: documentId,
      title: `Document ${documentId}`,
      metadata: { eventCount: events.length },
      content: fullContent,
      sections,
      version,
      lastModified: new Date().toISOString()
    };
  }
  
  /**
   * Record a user viewing a section for predictive prefetching
   * @param userId User identifier
   * @param documentId Document identifier
   * @param sectionId Section identifier
   * @private
   */
  private async recordSectionView(
    userId: string,
    documentId: string,
    sectionId: string
  ): Promise<void> {
    const key = `${userId}:${documentId}`;
    let behavior = this.userBehaviorCache.get(key);
    
    if (!behavior) {
      behavior = {
        userId,
        documentId,
        viewedSections: [],
        sectionViewCount: {},
        lastPosition: 0,
        lastActivity: new Date().toISOString()
      };
    }
    
    // Update viewed sections
    if (!behavior.viewedSections.includes(sectionId)) {
      behavior.viewedSections.push(sectionId);
    }
    
    // Update view count
    behavior.sectionViewCount[sectionId] = (behavior.sectionViewCount[sectionId] || 0) + 1;
    
    // Update other data
    behavior.lastActivity = new Date().toISOString();
    
    // Get section info
    const structure = await this.getDocumentStructure(documentId);
    const sectionInfo = structure.sections.find(s => s.id === sectionId);
    
    if (sectionInfo) {
      behavior.lastPosition = sectionInfo.startPosition;
    }
    
    // Update cache
    this.userBehaviorCache.set(key, behavior);
  }
  
  /**
   * Prefetch nearby sections based on current section and user behavior
   * @param userId User identifier
   * @param documentId Document identifier
   * @param currentSectionId Current section identifier
   * @private
   */
  private async prefetchNearbySections(
    userId: string,
    documentId: string,
    currentSectionId: string
  ): Promise<void> {
    // Skip if prefetching is disabled
    if (!this.config.enablePrefetching) {
      return;
    }
    
    // Skip if we're already prefetching too many sections
    if (this.prefetchQueue.size >= this.config.maxConcurrentPrefetches) {
      return;
    }
    
    // Get document structure
    const structure = await this.getDocumentStructure(documentId);
    const currentSectionIndex = structure.sections.findIndex(s => s.id === currentSectionId);
    
    if (currentSectionIndex === -1) {
      return;
    }
    
    // Determine which sections to prefetch
    const sectionsToFetch: string[] = [];
    
    // Simple strategy: fetch the next few sections
    for (let i = 1; i <= this.config.prefetchSectionCount; i++) {
      const nextIndex = currentSectionIndex + i;
      
      if (nextIndex < structure.sections.length) {
        sectionsToFetch.push(structure.sections[nextIndex].id);
      }
    }
    
    // More sophisticated strategy would use user behavior patterns
    const behaviorKey = `${userId}:${documentId}`;
    const behavior = this.userBehaviorCache.get(behaviorKey);
    
    if (behavior) {
      // Example: prefetch sections with high view counts
      const frequentlyViewedSections = Object.entries(behavior.sectionViewCount)
        .filter(([id, count]) => count > 1 && id !== currentSectionId)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .slice(0, 2);
      
      sectionsToFetch.push(...frequentlyViewedSections);
    }
    
    // Remove duplicates
    const uniqueSectionsToFetch = [...new Set(sectionsToFetch)];
    
    // Prefetch in background
    for (const sectionId of uniqueSectionsToFetch) {
      const prefetchKey = `${documentId}:${sectionId}`;
      
      // Skip if already in prefetch queue
      if (this.prefetchQueue.has(prefetchKey)) {
        continue;
      }
      
      // Add to prefetch queue
      this.prefetchQueue.add(prefetchKey);
      
      // Prefetch// filepath: d:\ai-dev-projects\ai-create-assistant\src\projections\ProjectionCache.ts
import { getTenantContext } from '../lib/tenant-context';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/collector';
import { BaseEvent, EventStore } from '../events/EventStore';
import Redis from 'ioredis';
import { prisma } from '../prisma/client';

/**
 * Cache tier levels
 */
export enum CacheTier {
  /** In-memory cache (fastest, limited capacity) */
  MEMORY = 'memory',
  /** Redis cache (medium speed, larger capacity) */
  REDIS = 'redis',
  /** Persistent PostgreSQL cache (slower, unlimited capacity) */
  POSTGRES = 'postgres'
}

/**
 * Cache hit result with source information
 */
export interface CacheResult<T> {
  /** Whether the data was found in cache */
  hit: boolean;
  /** Which cache tier the data was found in */
  tier?: CacheTier;
  /** The cached data (if hit is true) */
  data?: T;
  /** Time taken to retrieve the data in ms */
  retrievalTimeMs: number;
}

/**
 * Document section information
 */
export interface DocumentSection {
  /** Section identifier */
  id: string;
  /** Document identifier */
  documentId: string;
  /** Title of the section */
  title: string;
  /** Section content */
  content: string;
  /** Start position in document */
  startPosition: number;
  /** End position in document */
  endPosition: number;
  /** Whether this section has been prefetched */
  prefetched: boolean;
}

/**
 * Document structure without full content
 */
export interface DocumentStructure {
  /** Document identifier */
  id: string;
  /** Document title */
  title: string;
  /** Document metadata */
  metadata: Record<string, any>;
  /** Total number of sections */
  sectionCount: number;
  /** Total document length */
  totalLength: number;
  /** References to sections */
  sections: Array<{
    id: string;
    title: string;
    startPosition: number;
    endPosition: number;
  }>;
  /** Version of the document */
  version: number;
}

/**
 * Complete document with all content
 */
export interface DocumentProjection {
  /** Document identifier */
  id: string;
  /** Document title */
  title: string;
  /** Document metadata */
  metadata: Record<string, any>;
  /** Full document content */
  content: string;
  /** Complete sections with content */
  sections: DocumentSection[];
  /** Version of the document */
  version: number;
  /** Timestamp when the document was last modified */
  lastModified: string;
}

/**
 * User behavior data for prefetching decisions
 */
export interface UserBehavior {
  /** User identifier */
  userId: string;
  /** Document identifier */
  documentId: string;
  /** Sections the user has viewed */
  viewedSections: string[];
  /** Number of times each section was viewed */
  sectionViewCount: Record<string, number>;
  /** Last viewed position */
  lastPosition: number;
  /** Last activity timestamp */
  lastActivity: string;
}

/**
 * Configuration for the projection cache
 */
export interface ProjectionCacheConfig {
  /** Maximum items in memory cache */
  memoryCacheSize: number;
  /** TTL for memory cache items in seconds */
  memoryCacheTtlSeconds: number;
  /** TTL for Redis cache items in seconds */
  redisCacheTtlSeconds: number;
  /** Whether to enable predictive prefetching */
  enablePrefetching: boolean;
  /** Sections to prefetch ahead */
  prefetchSectionCount: number;
  /** Maximum concurrent prefetch operations */
  maxConcurrentPrefetches: number;
  /** Whether to log cache operations for analysis */
  logCacheOperations: boolean;
}

/**
 * Three-tier caching system for document projections with 
 * progressive loading and predictive prefetching
 */
export class ProjectionCache {
  private config: ProjectionCacheConfig;
  private eventStore: EventStore;
  private redisClient: Redis;
  private metricsCollector: MetricsCollector;
  private memoryCache = new Map<string, { data: any; expires: number }>();
  private prefetchQueue = new Set<string>();
  private userBehaviorCache = new Map<string, UserBehavior>();
  
  /**
   * Create a new projection cache
   * @param eventStore Event store for accessing document events
   * @param redisClient Redis client for caching
   * @param metricsCollector Metrics collector for monitoring
   * @param config Cache configuration
   */
  constructor(
    eventStore: EventStore,
    redisClient: Redis,
    metricsCollector: MetricsCollector,
    config: Partial<ProjectionCacheConfig> = {}
  ) {
    this.eventStore = eventStore;
    this.redisClient = redisClient;
    this.metricsCollector = metricsCollector;
    
    this.config = {
      memoryCacheSize: 100,
      memoryCacheTtlSeconds: 300, // 5 minutes
      redisCacheTtlSeconds: 3600, // 1 hour
      enablePrefetching: true,
      prefetchSectionCount: 2,
      maxConcurrentPrefetches: 3,
      logCacheOperations: true,
      ...config
    };
    
    // Start periodic cleaning of memory cache
    setInterval(() => this.cleanMemoryCache(), 60_000); // Every minute
  }
  
  /**
   * Get document structure (without full content) from cache or rebuild
   * @param documentId Document identifier
   * @returns Document structure
   */
  async getDocumentStructure(documentId: string): Promise<DocumentStructure> {
    const startTime = Date.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get document structure: No tenant context available');
    }
    
    const cacheKey = `doc:structure:${tenantContext.tenantId}:${documentId}`;
    
    try {
      // Try to get from cache
      const cacheResult = await this.getCached<DocumentStructure>(cacheKey);
      
      if (cacheResult.hit && cacheResult.data) {
        await this.metricsCollector.incrementCounter('cache.structure.hit', {
          tier: cacheResult.tier!,
          tenantId: tenantContext.tenantId
        });
        
        return cacheResult.data;
      }
      
      // Not in cache, rebuild from events
      const structure = await this.buildDocumentStructure(documentId);
      
      // Cache the result
      await this.setCached(cacheKey, structure);
      
      await this.metricsCollector.incrementCounter('cache.structure.miss', {
        tenantId: tenantContext.tenantId
      });
      
      return structure;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.structure.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Get a document section from cache or rebuild
   * @param documentId Document identifier
   * @param sectionId Section identifier
   * @returns Document section
   */
  async getDocumentSection(documentId: string, sectionId: string): Promise<DocumentSection> {
    const startTime = Date.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get document section: No tenant context available');
    }
    
    const cacheKey = `doc:section:${tenantContext.tenantId}:${documentId}:${sectionId}`;
    
    try {
      // Try to get from cache
      const cacheResult = await this.getCached<DocumentSection>(cacheKey);
      
      if (cacheResult.hit && cacheResult.data) {
        await this.metricsCollector.incrementCounter('cache.section.hit', {
          tier: cacheResult.tier!,
          tenantId: tenantContext.tenantId
        });
        
        // Record this section view for prefetching decisions
        if (tenantContext.userId) {
          await this.recordSectionView(
            tenantContext.userId,
            documentId,
            sectionId
          );
        }
        
        return cacheResult.data;
      }
      
      // Not in cache, rebuild from events
      const section = await this.buildDocumentSection(documentId, sectionId);
      
      // Cache the result
      await this.setCached(cacheKey, section);
      
      await this.metricsCollector.incrementCounter('cache.section.miss', {
        tenantId: tenantContext.tenantId
      });
      
      // Record this section view for prefetching decisions
      if (tenantContext.userId) {
        await this.recordSectionView(
          tenantContext.userId,
          documentId,
          sectionId
        );
      }
      
      // Trigger prefetching of nearby sections
      if (this.config.enablePrefetching && tenantContext.userId) {
        this.prefetchNearbySections(tenantContext.userId, documentId, sectionId);
      }
      
      return section;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.section.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Get complete document projection from cache or rebuild
   * @param documentId Document identifier
   * @returns Complete document projection
   */
  async getDocumentProjection(documentId: string): Promise<DocumentProjection> {
    const startTime = Date.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get document projection: No tenant context available');
    }
    
    const cacheKey = `doc:projection:${tenantContext.tenantId}:${documentId}`;
    
    try {
      // Try to get from cache
      const cacheResult = await this.getCached<DocumentProjection>(cacheKey);
      
      if (cacheResult.hit && cacheResult.data) {
        await this.metricsCollector.incrementCounter('cache.projection.hit', {
          tier: cacheResult.tier!,
          tenantId: tenantContext.tenantId
        });
        
        return cacheResult.data;
      }
      
      // Not in cache, build projection progressively
      
      // 1. Get structure first (fast)
      const structure = await this.getDocumentStructure(documentId);
      
      // 2. Get all sections in parallel
      const sectionPromises = structure.sections.map(section => 
        this.getDocumentSection(documentId, section.id)
      );
      
      const sections = await Promise.all(sectionPromises);
      
      // 3. Assemble complete projection
      const fullContent = sections
        .sort((a, b) => a.startPosition - b.startPosition)
        .map(s => s.content)
        .join('');
      
      const projection: DocumentProjection = {
        id: structure.id,
        title: structure.title,
        metadata: structure.metadata,
        content: fullContent,
        sections,
        version: structure.version,
        lastModified: new Date().toISOString()
      };
      
      // Cache the result
      await this.setCached(cacheKey, projection);
      
      await this.metricsCollector.incrementCounter('cache.projection.miss', {
        tenantId: tenantContext.tenantId
      });
      
      return projection;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.projection.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Rebuild a document projection using events
   * @param documentId Document identifier
   * @param targetVersion Target version to build (defaults to latest)
   * @returns Document projection
   */
  async rebuildProjection(documentId: string, targetVersion?: number): Promise<DocumentProjection> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot rebuild projection: No tenant context available');
    }
    
    const startTime = Date.now();
    
    try {
      // Get all events for the document
      const events = await this.eventStore.getEvents<BaseEvent>(documentId, 1, targetVersion);
      
      if (events.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }
      
      // Build projection from events
      const projection = this.buildProjectionFromEvents(events);
      
      // Update the cache with the new projection
      await this.invalidateDocumentCache(documentId);
      
      // Re-cache the structure and projection
      const structureKey = `doc:structure:${tenantContext.tenantId}:${documentId}`;
      const projectionKey = `doc:projection:${tenantContext.tenantId}:${documentId}`;
      
      const structure: DocumentStructure = {
        id: projection.id,
        title: projection.title,
        metadata: projection.metadata,
        sectionCount: projection.sections.length,
        totalLength: projection.content.length,
        sections: projection.sections.map(s => ({
          id: s.id,
          title: s.title,
          startPosition: s.startPosition,
          endPosition: s.endPosition
        })),
        version: projection.version
      };
      
      await this.setCached(structureKey, structure);
      await this.setCached(projectionKey, projection);
      
      // Cache each section separately
      for (const section of projection.sections) {
        const sectionKey = `doc:section:${tenantContext.tenantId}:${documentId}:${section.id}`;
        await this.setCached(sectionKey, section);
      }
      
      // Record rebuild metrics
      await this.metricsCollector.incrementCounter('cache.projection.rebuild', {
        tenantId: tenantContext.tenantId
      });
      
      return projection;
    } finally {
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('cache.projection.rebuild.duration', duration, {
        tenantId: tenantContext.tenantId
      });
    }
  }
  
  /**
   * Invalidate all cached data for a document
   * @param documentId Document identifier
   */
  async invalidateDocumentCache(documentId: string): Promise<void> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot invalidate cache: No tenant context available');
    }
    
    const tenantId = tenantContext.tenantId;
    
    // Clear from memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(`:${tenantId}:${documentId}:`)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear from Redis cache
    const redisKeys = await this.redisClient.keys(`doc:*:${tenantId}:${documentId}*`);
    if (redisKeys.length > 0) {
      await this.redisClient.del(...redisKeys);
    }
    
    // Clear from Postgres cache
    await prisma.documentCache.deleteMany({
      where: {
        documentId,
        tenantId
      }
    });
    
    // Log invalidation
    if (this.config.logCacheOperations) {
      await ComplianceLogger.log({
        eventType: 'cache.invalidated',
        resourceId: documentId,
        description: `Cache invalidated for document ${documentId}`,
        metadata: {
          tenantId
        }
      });
    }
    
    await this.metricsCollector.incrementCounter('cache.invalidated', {
      tenantId
    });
  }
  
  /**
   * Update the cache when new events are applied
   * @param documentId Document identifier
   * @param events New events that were applied
   */
  async updateCacheWithEvents(documentId: string, events: BaseEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update cache: No tenant context available');
    }
    
    // For now, just invalidate and rebuild on next request
    // In a real implementation, we could apply the events to the cached projection
    await this.invalidateDocumentCache(documentId);
    
    // Optionally rebuild right away
    // await this.rebuildProjection(documentId);
  }
  
  /**
   * Get data from cache (checking all tiers)
   * @param key Cache key
   * @returns Cache result
   * @private
   */
  private async getCached<T>(key: string): Promise<CacheResult<T>> {
    const startTime = Date.now();
    
    // 1. Check memory cache first (fastest)
    const memoryCacheEntry = this.memoryCache.get(key);
    
    if (memoryCacheEntry && memoryCacheEntry.expires > Date.now()) {
      return {
        hit: true,
        tier: CacheTier.MEMORY,
        data: memoryCacheEntry.data as T,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    // 2. Check Redis cache next
    const redisResult = await this.redisClient.get(key);
    
    if (redisResult) {
      const data = JSON.parse(redisResult) as T;
      
      // Store in memory cache for future access
      this.setMemoryCache(key, data);
      
      return {
        hit: true,
        tier: CacheTier.REDIS,
        data,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    // 3. Check Postgres cache as last resort
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      return {
        hit: false,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    const [, docType, , docId, sectionId] = key.split(':');
    
    const postgresResult = await prisma.documentCache.findFirst({
      where: {
        tenantId: tenantContext.tenantId,
        documentId: docId,
        type: docType,
        ...(sectionId ? { sectionId } : {})
      }
    });
    
    if (postgresResult) {
      const data = JSON.parse(postgresResult.data) as T;
      
      // Store in Redis for future access
      await this.redisClient.set(
        key, 
        JSON.stringify(data), 
        'EX', 
        this.config.redisCacheTtlSeconds
      );
      
      // Store in memory cache for future access
      this.setMemoryCache(key, data);
      
      return {
        hit: true,
        tier: CacheTier.POSTGRES,
        data,
        retrievalTimeMs: Date.now() - startTime
      };
    }
    
    // Not found in any cache
    return {
      hit: false,
      retrievalTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Set data in all cache tiers
   * @param key Cache key
   * @param data Data to cache
   * @private
   */
  private async setCached<T>(key: string, data: T): Promise<void> {
    // Extract document and section IDs from the key
    const [, docType, tenantId, docId, sectionId] = key.split(':');
    
    // 1. Set in memory cache
    this.setMemoryCache(key, data);
    
    // 2. Set in Redis cache
    await this.redisClient.set(
      key, 
      JSON.stringify(data), 
      'EX', 
      this.config.redisCacheTtlSeconds
    );
    
    // 3. Set in Postgres cache
    await prisma.documentCache.upsert({
      where: {
        tenantId_documentId_type_sectionId: {
          tenantId,
          documentId: docId,
          type: docType,
          sectionId: sectionId || ''
        }
      },
      update: {
        data: JSON.stringify(data),
        updatedAt: new Date()
      },
      create: {
        tenantId,
        documentId: docId,
        type: docType,
        sectionId: sectionId || '',
        data: JSON.stringify(data)
      }
    });
  }
  
  /**
   * Set data in memory cache
   * @param key Cache key
   * @param data Data to cache
   * @private
   */
  private setMemoryCache<T>(key: string, data: T): void {
    // Ensure we don't exceed the memory cache size
    if (this.memoryCache.size >= this.config.memoryCacheSize) {
      const keysIterator = this.memoryCache.keys();
      const oldestKey = keysIterator.next().value;
      this.memoryCache.delete(oldestKey);
    }
    
    // Set in memory cache with expiration
    this.memoryCache.set(key, {
      data,
      expires: Date.now() + (this.config.memoryCacheTtlSeconds * 1000)
    });
  }
  
  /**
   * Clean expired entries from memory cache
   * @private
   */
  private cleanMemoryCache(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires < now) {
        this.memoryCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0 && this.config.logCacheOperations) {
      console.log(`Cleaned ${expiredCount} expired entries from memory cache`);
    }
  }
  
  /**
   * Build document structure from events
   * @param documentId Document identifier
   * @returns Document structure
   * @private
   */
  private async buildDocumentStructure(documentId: string): Promise<DocumentStructure> {
    // In a real implementation, this would reconstruct the structure from events
    // For this example, we'll simulate it
    
    // Get current document version
    const currentVersion = await this.eventStore.getCurrentVersion(documentId);
    
    // Generate document structure
    const structure: DocumentStructure = {
      id: documentId,
      title: `Document ${documentId}`,
      metadata: { version: currentVersion },
      sectionCount: 3, // Example
      totalLength: 1000, // Example
      sections: [
        { id: 'section-1', title: 'Introduction', startPosition: 0, endPosition: 200 },
        { id: 'section-2', title: 'Main Content', startPosition: 200, endPosition: 800 },
        { id: 'section-3', title: 'Conclusion', startPosition: 800, endPosition: 1000 }
      ],
      version: currentVersion
    };
    
    return structure;
  }
  
  /**
   * Build a document section from events
   * @param documentId Document identifier
   * @param sectionId Section identifier
   * @returns Document section
   * @private
   */
  private async buildDocumentSection(documentId: string, sectionId: string): Promise<DocumentSection> {
    // In a real implementation, this would reconstruct the section from events
    // For this example, we'll simulate it
    
    const structure = await this.getDocumentStructure(documentId);
    const sectionInfo = structure.sections.find(s => s.id === sectionId);
    
    if (!sectionInfo) {
      throw new Error(`Section ${sectionId} not found in document ${documentId}`);
    }
    
    // Simulate section content
    const content = `Content for section ${sectionId} of document ${documentId}...`;
    
    return {
      id: sectionId,
      documentId,
      title: sectionInfo.title,
      content,
      startPosition: sectionInfo.startPosition,
      endPosition: sectionInfo.endPosition,
      prefetched: false
    };
  }
  
  /**
   * Build a complete document projection from events
   * @param events Document events
   * @returns Document projection
   * @private
   */
  private buildProjectionFromEvents(events: BaseEvent[]): DocumentProjection {
    // In a real implementation, this would reconstruct the document state
    // by replaying all events in sequence
    // For this example, we'll simulate it
    
    if (events.length === 0) {
      throw new Error('No events provided to build projection');
    }
    
    const documentId = events[0].aggregateId;
    const version = events[events.length - 1].aggregateVersion;
    
    // Simulate building projection
    const sections: DocumentSection[] = [
      {
        id: 'section-1',
        documentId,
        title: 'Introduction',
        content: 'Introduction content...',
        startPosition: 0,
        endPosition: 200,
        prefetched: false
      },
      {
        id: 'section-2',
        documentId,
        title: 'Main Content',
        content: 'Main content...',
        startPosition: 200,
        endPosition: 800,
        prefetched: false
      },
      {
        id: 'section-3',
        documentId,
        title: 'Conclusion',
        content: 'Conclusion content...',
        startPosition: 800,
        endPosition: 1000,
        prefetched: false
      }
    ];
    
    const fullContent = sections.map(s => s.content).join('\n\n');
    
    return {
      id: documentId,
      title: `Document ${documentId}`,
      metadata: { eventCount: events.length },
      content: fullContent,
      sections,
      version,
      lastModified: new Date().toISOString()
    };
  }
  
  /**
   * Record a user viewing a section for predictive prefetching
   * @param userId User identifier
   * @param documentId Document identifier
   * @param sectionId Section identifier
   * @private
   */
  private async recordSectionView(
    userId: string,
    documentId: string,
    sectionId: string
  ): Promise<void> {
    const key = `${userId}:${documentId}`;
    let behavior = this.userBehaviorCache.get(key);
    
    if (!behavior) {
      behavior = {
        userId,
        documentId,
        viewedSections: [],
        sectionViewCount: {},
        lastPosition: 0,
        lastActivity: new Date().toISOString()
      };
    }
    
    // Update viewed sections
    if (!behavior.viewedSections.includes(sectionId)) {
      behavior.viewedSections.push(sectionId);
    }
    
    // Update view count
    behavior.sectionViewCount[sectionId] = (behavior.sectionViewCount[sectionId] || 0) + 1;
    
    // Update other data
    behavior.lastActivity = new Date().toISOString();
    
    // Get section info
    const structure = await this.getDocumentStructure(documentId);
    const sectionInfo = structure.sections.find(s => s.id === sectionId);
    
    if (sectionInfo) {
      behavior.lastPosition = sectionInfo.startPosition;
    }
    
    // Update cache
    this.userBehaviorCache.set(key, behavior);
  }
  
  /**
   * Prefetch nearby sections based on current section and user behavior
   * @param userId User identifier
   * @param documentId Document identifier
   * @param currentSectionId Current section identifier
   * @private
   */
  private async prefetchNearbySections(
    userId: string,
    documentId: string,
    currentSectionId: string
  ): Promise<void> {
    // Skip if prefetching is disabled
    if (!this.config.enablePrefetching) {
      return;
    }
    
    // Skip if we're already prefetching too many sections
    if (this.prefetchQueue.size >= this.config.maxConcurrentPrefetches) {
      return;
    }
    
    // Get document structure
    const structure = await this.getDocumentStructure(documentId);
    const currentSectionIndex = structure.sections.findIndex(s => s.id === currentSectionId);
    
    if (currentSectionIndex === -1) {
      return;
    }
    
    // Determine which sections to prefetch
    const sectionsToFetch: string[] = [];
    
    // Simple strategy: fetch the next few sections
    for (let i = 1; i <= this.config.prefetchSectionCount; i++) {
      const nextIndex = currentSectionIndex + i;
      
      if (nextIndex < structure.sections.length) {
        sectionsToFetch.push(structure.sections[nextIndex].id);
      }
    }
    
    // More sophisticated strategy would use user behavior patterns
    const behaviorKey = `${userId}:${documentId}`;
    const behavior = this.userBehaviorCache.get(behaviorKey);
    
    if (behavior) {
      // Example: prefetch sections with high view counts
      const frequentlyViewedSections = Object.entries(behavior.sectionViewCount)
        .filter(([id, count]) => count > 1 && id !== currentSectionId)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .slice(0, 2);
      
      sectionsToFetch.push(...frequentlyViewedSections);
    }
    
    // Remove duplicates
    const uniqueSectionsToFetch = [...new Set(sectionsToFetch)];
    
    // Prefetch in background
    for (const sectionId of uniqueSectionsToFetch) {
      const prefetchKey = `${documentId}:${sectionId}`;
      
      // Skip if already in prefetch queue
      if (this.prefetchQueue.has(prefetchKey)) {
        continue;
      }
      
                // Add to prefetch queue
          this.prefetchQueue.add(prefetchKey);
          
          // Prefetch in background without awaiting
          this.processPrefetch(documentId, sectionId).catch(error => {
            console.error(`Error prefetching section ${sectionId} of document ${documentId}:`, error);
            this.prefetchQueue.delete(prefetchKey);
          });
        }
      }
    
      /**
       * Process a single prefetch request
       * @param documentId Document identifier
       * @param sectionId Section identifier
       * @private
       */
      private async processPrefetch(documentId: string, sectionId: string): Promise<void> {
        const prefetchKey = `${documentId}:${sectionId}`;
        const startTime = Date.now();
        
        try {
          // Actually perform the prefetch by loading the section
          const section = await this.buildDocumentSection(documentId, sectionId);
          
          // Mark as prefetched
          section.prefetched = true;
          
          // Store in cache
          const tenantContext = getTenantContext();
          if (!tenantContext?.tenantId) {
            throw new Error('Cannot prefetch section: No tenant context available');
          }
          
          const cacheKey = `doc:section:${tenantContext.tenantId}:${documentId}:${sectionId}`;
          await this.setCached(cacheKey, section);
          
          // Record metrics
          await this.metricsCollector.incrementCounter('cache.prefetch.completed', {
            tenantId: tenantContext.tenantId
          });
          
          const duration = Date.now() - startTime;
          await this.metricsCollector.recordValue('cache.prefetch.duration', duration, {
            tenantId: tenantContext.tenantId
          });
          
          if (this.config.logCacheOperations) {
            console.log(`Prefetched section ${sectionId} of document ${documentId} in ${duration}ms`);
          }
        } finally {
          // Remove from prefetch queue regardless of success/failure
          this.prefetchQueue.delete(prefetchKey);
        }
      }
      
      /**
       * Start processing the prefetch queue periodically
       * @private
       */
      private startPrefetchQueueProcessor(): void {
        // Process any pending prefetches every 100ms
        setInterval(() => {
          if (this.processingPrefetchQueue || this.prefetchQueue.size === 0) {
            return;
          }
          
          this.processPrefetchQueue().catch(error => {
            console.error('Error processing prefetch queue:', error);
          });
        }, 100);
      }
      
      /**
       * Process all pending prefetches in the queue
       * @private
       */
      private async processPrefetchQueue(): Promise<void> {
        this.processingPrefetchQueue = true;
        
        try {
          // Sort prefetch entries by priority
          const prefetchEntries: PrefetchEntry[] = Array.from(this.prefetchQueue)
            .map(key => {
              const [documentId, sectionId] = key.split(':');
              return {
                documentId,
                sectionId,
                priority: 1, // Default priority
                queuedAt: Date.now()
              };
            })
            .sort((a, b) => b.priority - a.priority); // Higher priority first
          
          // Process up to maxConcurrentPrefetches at a time
          const batch = prefetchEntries.slice(0, this.config.maxConcurrentPrefetches);
          
          if (batch.length > 0) {
            await Promise.all(
              batch.map(entry => 
                this.processPrefetch(entry.documentId, entry.sectionId)
              )
            );
          }
        } finally {
          this.processingPrefetchQueue = false;
        }
      }
      
      /**
       * Get analytics about cache usage
       * @returns Cache usage statistics
       */
      async getCacheStatistics(): Promise<{
        memoryCacheSize: number;
        redisCacheKeys: number;
        postgresCacheEntries: number;
        hitRates: {
          memory: number;
          redis: number;
          postgres: number;
          overall: number;
        };
      }> {
        const tenantContext = getTenantContext();
        
        if (!tenantContext?.tenantId) {
          throw new Error('Cannot get cache statistics: No tenant context available');
        }
        
        // Get hit counters from metrics
        const memoryHits = await this.metricsCollector.getCounter('cache.*.hit', {
          tier: CacheTier.MEMORY,
          tenantId: tenantContext.tenantId
        });
        
        const redisHits = await this.metricsCollector.getCounter('cache.*.hit', {
          tier: CacheTier.REDIS,
          tenantId: tenantContext.tenantId
        });
        
        const postgresHits = await this.metricsCollector.getCounter('cache.*.hit', {
          tier: CacheTier.POSTGRES,
          tenantId: tenantContext.tenantId
        });
        
        const misses = await this.metricsCollector.getCounter('cache.*.miss', {
          tenantId: tenantContext.tenantId
        });
        
        const totalAttempts = memoryHits + redisHits + postgresHits + misses;
        const totalHits = memoryHits + redisHits + postgresHits;
        
        // Count items in Redis cache for this tenant
        const redisKeys = await this.redisClient.keys(`*:${tenantContext.tenantId}:*`);
        
        // Count items in Postgres cache for this tenant
        const postgresCacheCount = await prisma.documentCache.count({
          where: {
            tenantId: tenantContext.tenantId
          }
        });
        
        return {
          memoryCacheSize: this.memoryCache.size,
          redisCacheKeys: redisKeys.length,
          postgresCacheEntries: postgresCacheCount,
          hitRates: {
            memory: totalAttempts > 0 ? memoryHits / totalAttempts : 0,
            redis: totalAttempts > 0 ? redisHits / totalAttempts : 0,
            postgres: totalAttempts > 0 ? postgresHits / totalAttempts : 0,
            overall: totalAttempts > 0 ? totalHits / totalAttempts : 0
          }
        };
      }
    }