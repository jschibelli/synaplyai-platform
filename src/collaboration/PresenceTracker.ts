import { getTenantContext } from '../lib/tenant-context';
import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * User presence information
 */
export interface UserPresence {
  /**
   * Unique ID of the user
   */
  userId: string;
  
  /**
   * Display name for the user
   */
  displayName: string;
  
  /**
   * Avatar URL or identifier
   */
  avatar?: string;
  
  /**
   * When the user's presence was last updated
   */
  lastActiveAt: number;
  
  /**
   * Connection state (online, away, offline)
   */
  connectionState: 'online' | 'away' | 'offline';
  
  /**
   * Current location within the document
   */
  location?: {
    /**
     * Section or element ID the user is currently viewing
     */
    sectionId?: string;
    
    /**
     * Approximate position in the document
     */
    position?: number;
    
    /**
     * Viewport information for scrolling indicators
     */
    viewport?: {
      top: number;
      bottom: number;
    };
  };
  
  /**
   * Custom metadata for the user
   */
  metadata?: Record<string, any>;
}

/**
 * Options for the presence tracker
 */
export interface PresenceTrackerOptions {
  /**
   * How long until a user is considered "away" (ms)
   */
  awayThresholdMs: number;
  
  /**
   * How long until a user is considered "offline" (ms)
   */
  offlineThresholdMs: number;
  
  /**
   * How often to clean up stale presence data (ms)
   */
  cleanupIntervalMs: number;
  
  /**
   * Whether to track metrics
   */
  trackMetrics?: boolean;
}

/**
 * Presence tracker for collaborative editing
 * Tracks which users are currently viewing or editing a document
 */
export class PresenceTracker {
  private presenceByDocument: Map<string, Map<string, UserPresence>> = new Map();
  private heartbeatTimers: Map<string, Map<string, NodeJS.Timeout>> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private options: PresenceTrackerOptions;
  
  /**
   * Create a new presence tracker
   */
  constructor(
    private metricsCollector?: MetricsCollector,
    options?: Partial<PresenceTrackerOptions>
  ) {
    this.options = {
      awayThresholdMs: 30000,      // 30 seconds
      offlineThresholdMs: 120000,  // 2 minutes
      cleanupIntervalMs: 60000,    // 1 minute
      trackMetrics: true,
      ...options
    };
    
    this.startCleanupTimer();
  }
  
  /**
   * Update a user's presence in a document
   */
  public updatePresence(
    documentId: string,
    userId: string,
    presence: Partial<Omit<UserPresence, 'userId' | 'lastActiveAt' | 'connectionState'>>
  ): UserPresence {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update presence: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    
    // Get or create document presence map
    let documentPresence = this.presenceByDocument.get(tenantDocumentKey);
    if (!documentPresence) {
      documentPresence = new Map<string, UserPresence>();
      this.presenceByDocument.set(tenantDocumentKey, documentPresence);
    }
    
    // Get existing presence or create new
    const existingPresence = documentPresence.get(userId) || {
      userId,
      displayName: 'Unknown User',
      lastActiveAt: Date.now(),
      connectionState: 'online'
    };
    
    // Update presence with new data
    const updatedPresence: UserPresence = {
      ...existingPresence,
      ...presence,
      userId,
      lastActiveAt: Date.now(),
      connectionState: 'online'
    };
    
    // Store updated presence
    documentPresence.set(userId, updatedPresence);
    
    // Set or refresh heartbeat timer
    this.refreshHeartbeatTimer(tenantDocumentKey, userId);
    
    // Track metrics if enabled
    if (this.options.trackMetrics && this.metricsCollector) {
      this.metricsCollector.incrementCounter('presence.update', {
        tenantId: tenantContext.tenantId,
        documentId
      });
    }
    
    return updatedPresence;
  }
  
  /**
   * Get all users present in a document
   */
  public getDocumentPresence(documentId: string): UserPresence[] {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get presence: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentPresence = this.presenceByDocument.get(tenantDocumentKey);
    
    if (!documentPresence) {
      return [];
    }
    
    return Array.from(documentPresence.values());
  }
  
  /**
   * Remove a user's presence from a document
   */
  public removePresence(documentId: string, userId: string): void {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot remove presence: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentPresence = this.presenceByDocument.get(tenantDocumentKey);
    
    if (!documentPresence) {
      return;
    }
    
    // Remove user presence
    documentPresence.delete(userId);
    
    // Clean up heartbeat timer
    this.clearHeartbeatTimer(tenantDocumentKey, userId);
    
    // If no users left in document, clean up document entry
    if (documentPresence.size === 0) {
      this.presenceByDocument.delete(tenantDocumentKey);
      this.heartbeatTimers.delete(tenantDocumentKey);
    }
    
    // Track metrics if enabled
    if (this.options.trackMetrics && this.metricsCollector) {
      this.metricsCollector.incrementCounter('presence.remove', {
        tenantId: tenantContext.tenantId,
        documentId
      });
    }
  }
  
  /**
   * Get user count for a document
   */
  public getUserCount(documentId: string): number {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get user count: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentPresence = this.presenceByDocument.get(tenantDocumentKey);
    
    return documentPresence ? documentPresence.size : 0;
  }
  
  /**
   * Mark a user as away or offline based on inactivity
   */
  private updateUserState(
    tenantDocumentKey: string,
    userId: string,
    state: 'away' | 'offline'
  ): void {
    const documentPresence = this.presenceByDocument.get(tenantDocumentKey);
    
    if (!documentPresence) {
      return;
    }
    
    const userPresence = documentPresence.get(userId);
    
    if (!userPresence) {
      return;
    }
    
    // Update state
    documentPresence.set(userId, {
      ...userPresence,
      connectionState: state
    });
    
    // If offline, schedule removal
    if (state === 'offline') {
      this.clearHeartbeatTimer(tenantDocumentKey, userId);
      
      // Remove after double the offline threshold
      setTimeout(() => {
        const currentPresence = this.presenceByDocument.get(tenantDocumentKey)?.get(userId);
        
        if (currentPresence && currentPresence.connectionState === 'offline') {
          this.presenceByDocument.get(tenantDocumentKey)?.delete(userId);
          
          // Clean up document if empty
          if (this.presenceByDocument.get(tenantDocumentKey)?.size === 0) {
            this.presenceByDocument.delete(tenantDocumentKey);
            this.heartbeatTimers.delete(tenantDocumentKey);
          }
        }
      }, this.options.offlineThresholdMs * 2);
    }
  }
  
  /**
   * Refresh or create heartbeat timer for user presence
   */
  private refreshHeartbeatTimer(tenantDocumentKey: string, userId: string): void {
    // Clear existing timer if any
    this.clearHeartbeatTimer(tenantDocumentKey, userId);
    
    // Get document timers or create new map
    let documentTimers = this.heartbeatTimers.get(tenantDocumentKey);
    if (!documentTimers) {
      documentTimers = new Map<string, NodeJS.Timeout>();
      this.heartbeatTimers.set(tenantDocumentKey, documentTimers);
    }
    
    // Set timer for "away" state
    const awayTimer = setTimeout(() => {
      this.updateUserState(tenantDocumentKey, userId, 'away');
      
      // Set timer for "offline" state
      const offlineTimer = setTimeout(() => {
        this.updateUserState(tenantDocumentKey, userId, 'offline');
      }, this.options.offlineThresholdMs - this.options.awayThresholdMs);
      
      // Store the offline timer
      documentTimers?.set(userId, offlineTimer);
    }, this.options.awayThresholdMs);
    
    // Store the timer
    documentTimers.set(userId, awayTimer);
  }
  
  /**
   * Clear heartbeat timer for a user
   */
  private clearHeartbeatTimer(tenantDocumentKey: string, userId: string): void {
    const documentTimers = this.heartbeatTimers.get(tenantDocumentKey);
    
    if (!documentTimers) {
      return;
    }
    
    const timer = documentTimers.get(userId);
    
    if (timer) {
      clearTimeout(timer);
      documentTimers.delete(userId);
    }
  }
  
  /**
   * Start periodic cleanup of stale presence data
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStalePresence();
    }, this.options.cleanupIntervalMs);
  }
  
  /**
   * Clean up stale presence data
   */
  private cleanupStalePresence(): void {
    const now = Date.now();
    const offlineThreshold = now - this.options.offlineThresholdMs;
    
    // Check each document
    this.presenceByDocument.forEach((documentPresence, tenantDocumentKey) => {
      // Check each user
      documentPresence.forEach((presence, userId) => {
        // Remove if last active time is older than offline threshold
        if (presence.lastActiveAt < offlineThreshold) {
          this.updateUserState(tenantDocumentKey, userId, 'offline');
        }
      });
      
      // Remove empty documents
      if (documentPresence.size === 0) {
        this.presenceByDocument.delete(tenantDocumentKey);
        this.heartbeatTimers.delete(tenantDocumentKey);
      }
    });
  }
  
  /**
   * Stop all timers and clean up resources
   */
  public dispose(): void {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Clear all heartbeat timers
    this.heartbeatTimers.forEach(documentTimers => {
      documentTimers.forEach(timer => clearTimeout(timer));
    });
    
    // Clear data
    this.heartbeatTimers.clear();
    this.presenceByDocument.clear();
  }
}