/**
 * VectorClock implementation for tracking causality between events
 * in a distributed system like collaborative editing
 */
export class VectorClock {
  private clock: Record<string, number>;
  
  /**
   * Create a new VectorClock
   * @param userId Optional user ID to initialize clock with
   * @param initialClock Optional initial clock values
   */
  constructor(
    userId?: string,
    initialClock?: Record<string, number>
  ) {
    this.clock = initialClock || {};
    if (userId) {
      this.increment(userId);
    }
  }
  
  /**
   * Increment the clock value for a user
   * @param userId The user ID to increment
   */
  increment(userId: string): void {
    this.clock[userId] = (this.clock[userId] || 0) + 1;
  }
  
  /**
   * Get the current clock values
   */
  getClock(): Record<string, number> {
    return { ...this.clock };
  }
  
  /**
   * Compare this vector clock with another to determine causality
   * @param other The other vector clock or raw clock values
   * @returns -1 if this happens before other, 1 if this happens after other, 0 if concurrent
   */
  compare(other: VectorClock | Record<string, number>): -1 | 0 | 1 {
    const thisClock = this.clock;
    const otherClock = other instanceof VectorClock ? other.getClock() : other;
    
    let thisGreater = false;
    let otherGreater = false;
    
    // Check all keys in this clock
    for (const userId in thisClock) {
      const thisValue = thisClock[userId] || 0;
      const otherValue = otherClock[userId] || 0;
      
      if (thisValue > otherValue) {
        thisGreater = true;
      } else if (thisValue < otherValue) {
        otherGreater = true;
      }
    }
    
    // Check all keys in other clock that might not be in this clock
    for (const userId in otherClock) {
      if (!(userId in thisClock) && otherClock[userId] > 0) {
        otherGreater = true;
      }
    }
    
    // Determine causality
    if (thisGreater && !otherGreater) {
      return 1; // This happens after other
    } else if (!thisGreater && otherGreater) {
      return -1; // This happens before other
    } else {
      return 0; // Concurrent operations
    }
  }
  
  /**
   * Merge this vector clock with another vector clock
   * Taking the maximum value for each user
   */
  merge(other: VectorClock | Record<string, number>): void {
    const otherClock = other instanceof VectorClock ? other.getClock() : other;
    
    for (const userId in otherClock) {
      this.clock[userId] = Math.max(this.clock[userId] || 0, otherClock[userId] || 0);
    }
  }
  
  /**
   * Check if this clock is identical to another
   * @param other The other vector clock or raw clock values
   */
  equals(other: VectorClock | Record<string, number>): boolean {
    const otherClock = other instanceof VectorClock ? other.getClock() : other;
    
    // Check if all keys in this clock match the other clock
    for (const userId in this.clock) {
      if ((this.clock[userId] || 0) !== (otherClock[userId] || 0)) {
        return false;
      }
    }
    
    // Check if all keys in other clock match this clock
    for (const userId in otherClock) {
      if ((otherClock[userId] || 0) !== (this.clock[userId] || 0)) {
        return false;
      }
    }
    
    return true;
  }
}

