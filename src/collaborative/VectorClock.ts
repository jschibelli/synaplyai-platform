/**
 * Vector Clock implementation for causality tracking in collaborative editing
 */
export class VectorClock {
  private clock: Record<string, number>;
  
  /**
   * Create a new vector clock, optionally initializing for a user
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
   * Compare this clock with another vector clock
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
   * Check if this clock is identical to another clock
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