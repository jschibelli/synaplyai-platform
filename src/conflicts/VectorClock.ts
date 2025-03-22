/**
 * Vector clock implementation for conflict detection
 */
export class VectorClock {
  private clock: Record<string, number> = {};
  
  constructor(userId?: string, initialValue: number = 0) {
    if (userId) {
      this.clock[userId] = initialValue;
    }
  }
  
  /**
   * Get current clock value
   */
  getClock(): Record<string, number> {
    return { ...this.clock }; // Return copy to prevent external mutation
  }
  
  /**
   * Check if vector clock is empty
   */
  isEmpty(): boolean {
    return Object.keys(this.clock).length === 0;
  }
  
  /**
   * Increment clock for specified user
   */
  increment(userId: string): void {
    if (!this.clock[userId]) {
      this.clock[userId] = 0;
    }
    this.clock[userId]++;
  }
  
  /**
   * Check if this vector clock is concurrent with another
   * Two clocks are concurrent if neither happened before the other
   */
  isConcurrentWith(otherClock: VectorClock): boolean {
    const otherClockValues = otherClock.getClock();
    let thisGreater = false;
    let otherGreater = false;
    
    // Check if this clock is greater in at least one position
    Object.keys(this.clock).forEach(userId => {
      const thisValue = this.clock[userId] || 0;
      const otherValue = otherClockValues[userId] || 0;
      
      if (thisValue > otherValue) {
        thisGreater = true;
      }
    });
    
    // Check if other clock is greater in at least one position
    Object.keys(otherClockValues).forEach(userId => {
      const thisValue = this.clock[userId] || 0;
      const otherValue = otherClockValues[userId] || 0;
      
      if (otherValue > thisValue) {
        otherGreater = true;
      }
    });
    
    // Concurrent if both clocks are greater in different positions
    return thisGreater && otherGreater;
  }
  
  /**
   * Merge with another vector clock, taking the maximum value for each entry
   */
  merge(otherClock: VectorClock): VectorClock {
    const result = new VectorClock();
    const otherClockValues = otherClock.getClock();
    const allUsers = new Set([
      ...Object.keys(this.clock),
      ...Object.keys(otherClockValues)
    ]);
    
    allUsers.forEach(userId => {
      const thisValue = this.clock[userId] || 0;
      const otherValue = otherClockValues[userId] || 0;
      result.clock[userId] = Math.max(thisValue, otherValue);
    });
    
    return result;
  }
  
  /**
   * Compare vector clocks
   * @returns -1 if this < other, 0 if concurrent, 1 if this > other
   */
  compare(otherClock: VectorClock): -1 | 0 | 1 {
    if (this.isConcurrentWith(otherClock)) {
      return 0;
    }
    
    const otherClockValues = otherClock.getClock();
    let thisLessThanOrEqual = true;
    let thisGreaterInAllPositions = true;
    
    // Check all positions in this clock
    Object.keys(this.clock).forEach(userId => {
      const thisValue = this.clock[userId] || 0;
      const otherValue = otherClockValues[userId] || 0;
      
      if (thisValue > otherValue) {
        thisLessThanOrEqual = false;
      }
      
      if (thisValue <= otherValue) {
        thisGreaterInAllPositions = false;
      }
    });
    
    // Check all positions in other clock
    Object.keys(otherClockValues).forEach(userId => {
      const thisValue = this.clock[userId] || 0;
      const otherValue = otherClockValues[userId] || 0;
      
      if (thisValue < otherValue) {
        thisGreaterInAllPositions = false;
      }
    });
    
    if (thisLessThanOrEqual) {
      return -1;
    } else if (thisGreaterInAllPositions) {
      return 1;
    } else {
      return 0; // Concurrent
    }
  }
}