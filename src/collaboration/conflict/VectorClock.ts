/**
 * Represents a vector clock for tracking causality in distributed operations
 * Each client has its own logical clock that increments with each local operation
 */
export class VectorClock {
  constructor(public clock: Record<string, number> = {}) {}

  /**
   * Increments the counter for the specified node/client
   */
  increment(clientId: string): VectorClock {
    this.clock[clientId] = (this.clock[clientId] || 0) + 1;
    return this;
  }

  /**
   * Merges this vector clock with another, taking the maximum value for each nodeId
   */
  merge(other: VectorClock): VectorClock {
    const mergedClock = new VectorClock(this.clock);
    
    // Take the maximum value for each client
    for (const [clientId, otherTime] of Object.entries(other.clock)) {
      const thisTime = this.clock[clientId] || 0;
      if (otherTime > thisTime) {
        mergedClock.clock[clientId] = otherTime;
      }
    }
    
    return mergedClock;
  }

  /**
   * Returns the entire clock as an object
   */
  getClock(clientId?: string): Record<string, number> | number {
    if (clientId) {
      return this.clock[clientId] || 0;
    }
    return { ...this.clock };
  }

  /**
   * Gets the timestamp for a specific node
   */
  getTimestamp(nodeId: string): number {
    return this.clock[nodeId] || 0;
  }

  /**
   * Compares this vector clock with another to determine causality
   * Returns:
   * - 1: this happened after other
   * - -1: this happened before other
   * - 0: the operations happened concurrently or are identical
   */
  compare(other: VectorClock): number {
    // Check if this happens before other
    let thisBeforeOther = false;
    let otherBeforeThis = false;
    
    // Check all keys in this clock
    for (const clientId of Object.keys(this.clock)) {
      const thisTime = this.clock[clientId] || 0;
      const otherTime = other.clock[clientId] || 0;
      
      if (thisTime > otherTime) {
        thisBeforeOther = true;
      } else if (thisTime < otherTime) {
        otherBeforeThis = true;
      }
    }
    
    // Check all keys in other clock
    for (const clientId of Object.keys(other.clock)) {
      if (!this.clock[clientId]) {
        otherBeforeThis = true;
      }
    }
    
    if (thisBeforeOther && !otherBeforeThis) {
      return 1;  // this happens after other
    } else if (!thisBeforeOther && otherBeforeThis) {
      return -1; // this happens before other
    } else {
      return 0;  // concurrent or identical
    }
  }
  
  /**
   * Checks if two vector clocks are equal
   */
  equals(other: VectorClock): boolean {
    const thisClock = this.clock;
    const otherClock = other.getClock() as Record<string, number>;
    
    // Check if all keys in this clock match other clock
    for (const nodeId in thisClock) {
      if (thisClock[nodeId] !== otherClock[nodeId]) {
        return false;
      }
    }
    
    // Check if all keys in other clock match this clock
    for (const nodeId in otherClock) {
      if (otherClock[nodeId] !== thisClock[nodeId]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Checks if the vector clock is empty
   */
  isEmpty(): boolean {
    return Object.keys(this.clock).length === 0;
  }

  /**
   * Creates a JSON representation of the vector clock
   */
  toJSON(): Record<string, number> {
    return { ...this.clock };
  }
  
  /**
   * Creates a vector clock from JSON
   */
  static fromJSON(json: Record<string, number>): VectorClock {
    return new VectorClock(json);
  }

  /**
   * Checks if the vector clock is concurrent with another
   */
  isConcurrentWith(other: VectorClock): boolean {
    // Two clocks are concurrent if they're incomparable (some values greater, some less)
    // Equal clocks are NOT concurrent with each other (they represent the same causal history)
    
    // If clocks are equal, they're not concurrent
    if (this.equals(other)) {
      return false;
    }
    
    // Otherwise, they're concurrent if neither happens before the other
    return !this.happenedBefore(other) && !other.happenedBefore(this);
  }

  /**
   * Makes VectorClock compatible with Record<string, number>
   */
  toRecord(): Record<string, number> {
    return { ...this.clock };
  }

  /**
   * Determines if this vector clock happened before another
   */
  happenedBefore(other: VectorClock): boolean {
    // A happened before B if A has some values less than B and none greater
    let foundLess = false;
    
    // Check each node in this clock
    for (const [nodeId, timestamp] of Object.entries(this.clock)) {
      // If other doesn't have this node or has a smaller value, this can't have happened before other
      if (!(nodeId in other.clock) || timestamp > other.clock[nodeId]) {
        return false;
      }
      
      // Track if we found at least one value where this is less than other
      if (timestamp < other.clock[nodeId]) {
        foundLess = true;
      }
    }
    
    // Check if other has nodes this doesn't have
    for (const nodeId in other.clock) {
      if (!(nodeId in this.clock) && other.clock[nodeId] > 0) {
        foundLess = true;
      }
    }
    
    // This happened before other if at least one value is less and none are greater
    return foundLess;
  }

  /**
   * Creates a clone of this vector clock
   */
  clone(): VectorClock {
    // Create a new clock with a copy of this clock's data
    return new VectorClock({ ...this.clock });
  }

  /**
   * Alias for getClock() to maintain backward compatibility with tests
   */
  getClocks(): Record<string, number> {
    // Need to ensure we're returning Record<string, number> and not a number
    return { ...this.clock };
  }
}