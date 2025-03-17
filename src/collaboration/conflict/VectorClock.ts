/**
 * Vector clock implementation for establishing causality between events
 * in a distributed collaborative editing system.
 */
export class VectorClock {
  private clocks: Record<string, number>;

  /**
   * Create a new vector clock
   * @param initialClocks Optional initial clock values
   */
  constructor(initialClocks?: Record<string, number>) {
    this.clocks = initialClocks ? { ...initialClocks } : {};
  }

  /**
   * Get the clock value for a specific client
   * @param clientId Client identifier
   * @returns The clock value, or 0 if not present
   */
  getClock(clientId: string): number {
    return this.clocks[clientId] || 0;
  }

  /**
   * Get all clock values
   * @returns Record of all clock values
   */
  getClocks(): Record<string, number> {
    return { ...this.clocks };
  }

  /**
   * Increment the clock value for a specific client
   * @param clientId Client identifier
   * @returns Updated vector clock instance (for chaining)
   */
  increment(clientId: string): VectorClock {
    this.clocks[clientId] = (this.clocks[clientId] || 0) + 1;
    return this;
  }

  /**
   * Update this vector clock by merging with another
   * (taking the maximum values for each client)
   * @param other Another vector clock to merge with
   * @returns Updated vector clock instance (for chaining)
   */
  merge(other: VectorClock): VectorClock {
    const otherClocks = other.getClocks();
    
    for (const [clientId, value] of Object.entries(otherClocks)) {
      this.clocks[clientId] = Math.max(this.getClock(clientId), value);
    }
    
    return this;
  }

  /**
   * Check if this vector clock happened before another
   * @param other Vector clock to compare with
   * @returns True if this happened before other
   */
  happenedBefore(other: VectorClock): boolean {
    // If any value in this clock is greater than the corresponding value
    // in the other clock, then this did not happen before other
    const otherClocks = other.getClocks();
    let atLeastOneLess = false;
    
    // Check each key in this clock
    for (const [clientId, value] of Object.entries(this.clocks)) {
      const otherValue = otherClocks[clientId] || 0;
      
      if (value > otherValue) {
        // This clock has a higher value, so it did not happen before
        return false;
      }
      
      if (value < otherValue) {
        atLeastOneLess = true;
      }
    }
    
    // Check for keys in other that aren't in this
    for (const clientId of Object.keys(otherClocks)) {
      if (!(clientId in this.clocks) && otherClocks[clientId] > 0) {
        atLeastOneLess = true;
      }
    }
    
    // For this to have happened before other, at least one value must be less
    return atLeastOneLess;
  }

  /**
   * Check if this vector clock is concurrent with another
   * (neither happened before the other)
   * @param other Vector clock to compare with
   * @returns True if clocks are concurrent
   */
  isConcurrentWith(other: VectorClock): boolean {
    return !this.happenedBefore(other) && !other.happenedBefore(this);
  }

  /**
   * Check if this vector clock equals another
   * @param other Vector clock to compare with
   * @returns True if clocks are equal
   */
  equals(other: VectorClock): boolean {
    const thisKeys = Object.keys(this.clocks);
    const otherKeys = Object.keys(other.getClocks());
    
    // Different number of keys means they can't be equal
    if (thisKeys.length !== otherKeys.length) {
      return false;
    }
    
    // Check all values match
    for (const clientId of thisKeys) {
      if (this.clocks[clientId] !== other.getClock(clientId)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Create a copy of this vector clock
   * @returns New vector clock with same values
   */
  clone(): VectorClock {
    return new VectorClock(this.getClocks());
  }

  /**
   * Check if vector clock is empty (has no entries)
   * @returns True if empty
   */
  isEmpty(): boolean {
    return Object.keys(this.clocks).length === 0;
  }

  /**
   * Convert to string representation
   * @returns String representation of vector clock
   */
  toString(): string {
    return JSON.stringify(this.clocks);
  }
}