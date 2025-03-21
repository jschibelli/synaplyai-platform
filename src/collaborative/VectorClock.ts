export class VectorClock {
  private clock: Record<string, number>;
  
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
  compare(other: VectorClock): -1 | 0 | 1 {
    const thisClock = this.clock;
    const otherClock = other.getClock();
    
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
}