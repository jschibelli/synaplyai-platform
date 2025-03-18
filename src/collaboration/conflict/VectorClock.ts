/**
 * Represents a vector clock for tracking causality in distributed operations
 * Each client has its own logical clock that increments with each local operation
 */
export class VectorClock {
  private clock: Record<string, number>;
  
  constructor(initialClock?: Record<string, number>) {
    this.clock = initialClock ? { ...initialClock } : {};
  }
  
  /**
   * Increments the counter for the specified node/client
   */
  increment(nodeId: string): VectorClock {
    const updated = new VectorClock(this.clock);
    updated.clock[nodeId] = (this.clock[nodeId] || 0) + 1;
    return updated;
  }
  
  /**
   * Merges this vector clock with another, taking the maximum value for each nodeId
   */
  merge(other: VectorClock): VectorClock {
    const result = new VectorClock(this.clock);
    
    for (const [nodeId, timestamp] of Object.entries(other.getClock())) {
      result.clock[nodeId] = Math.max(result.clock[nodeId] || 0, timestamp);
    }
    
    return result;
  }
  
  /**
   * Returns the entire clock as an object
   */
  getClock(): Record<string, number> {
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
   * - 'before': this happened before other
   * - 'after': this happened after other
   * - 'concurrent': the operations happened concurrently
   * - 'same': the vector clocks are identical
   */
  compare(other: VectorClock): 'before' | 'after' | 'concurrent' | 'same' {
    if (this.equals(other)) {
      return 'same';
    }
    
    let thisBeforeOther = true;
    let otherBeforeThis = true;
    
    const otherClock = other.getClock();
    
    // Check if this happened before other
    for (const [nodeId, timestamp] of Object.entries(this.clock)) {
      if (!(nodeId in otherClock) && timestamp > 0) {
        otherBeforeThis = false;
      } else if (timestamp > otherClock[nodeId]) {
        otherBeforeThis = false;
      }
    }
    
    // Check if other happened before this
    for (const [nodeId, timestamp] of Object.entries(otherClock)) {
      if (!(nodeId in this.clock) && timestamp > 0) {
        thisBeforeOther = false;
      } else if (timestamp > (this.clock[nodeId] || 0)) {
        thisBeforeOther = false;
      }
    }
    
    if (thisBeforeOther && !otherBeforeThis) return 'before';
    if (!thisBeforeOther && otherBeforeThis) return 'after';
    return 'concurrent';
  }
  
  /**
   * Checks if two vector clocks are equal
   */
  equals(other: VectorClock): boolean {
    const thisClock = this.clock;
    const otherClock = other.getClock();
    
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
}