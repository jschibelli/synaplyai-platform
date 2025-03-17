import { VectorClock } from '../../../src/collaboration/conflict/VectorClock';

describe('VectorClock', () => {
  describe('constructor', () => {
    test('should create empty clock when no arguments are provided', () => {
      const clock = new VectorClock();
      expect(clock.getClocks()).toEqual({});
      expect(clock.isEmpty()).toBe(true);
    });

    test('should initialize with provided values', () => {
      const initial = { client1: 1, client2: 2 };
      const clock = new VectorClock(initial);
      expect(clock.getClocks()).toEqual(initial);
      expect(clock.isEmpty()).toBe(false);
    });
  });

  describe('getClock', () => {
    test('should return correct value for existing client', () => {
      const clock = new VectorClock({ client1: 5 });
      expect(clock.getClock('client1')).toBe(5);
    });

    test('should return 0 for non-existing client', () => {
      const clock = new VectorClock({ client1: 5 });
      expect(clock.getClock('client2')).toBe(0);
    });
  });

  describe('increment', () => {
    test('should increment existing client', () => {
      const clock = new VectorClock({ client1: 5 });
      clock.increment('client1');
      expect(clock.getClock('client1')).toBe(6);
    });

    test('should initialize and increment non-existing client', () => {
      const clock = new VectorClock();
      clock.increment('client1');
      expect(clock.getClock('client1')).toBe(1);
    });

    test('should return self for chaining', () => {
      const clock = new VectorClock();
      const result = clock.increment('client1');
      expect(result).toBe(clock);
    });
  });

  describe('merge', () => {
    test('should take maximum values from both clocks', () => {
      const clock1 = new VectorClock({ client1: 3, client2: 5 });
      const clock2 = new VectorClock({ client1: 5, client3: 2 });
      
      clock1.merge(clock2);
      
      expect(clock1.getClocks()).toEqual({
        client1: 5,
        client2: 5,
        client3: 2
      });
    });

    test('should return self for chaining', () => {
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client2: 2 });
      
      const result = clock1.merge(clock2);
      
      expect(result).toBe(clock1);
    });
  });

  describe('happenedBefore', () => {
    test('should detect when one clock happened before another', () => {
      const earlier = new VectorClock({ client1: 1, client2: 2 });
      const later = new VectorClock({ client1: 2, client2: 3 });
      
      expect(earlier.happenedBefore(later)).toBe(true);
      expect(later.happenedBefore(earlier)).toBe(false);
    });

    test('should return false when clocks are concurrent', () => {
      const clock1 = new VectorClock({ client1: 5, client2: 1 });
      const clock2 = new VectorClock({ client1: 3, client2: 7 });
      
      expect(clock1.happenedBefore(clock2)).toBe(false);
      expect(clock2.happenedBefore(clock1)).toBe(false);
    });

    test('should handle missing entries', () => {
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client1: 1, client2: 1 });
      
      expect(clock1.happenedBefore(clock2)).toBe(true);
      expect(clock2.happenedBefore(clock1)).toBe(false);
    });

    test('should return false when clocks are equal', () => {
      const clock1 = new VectorClock({ client1: 1, client2: 2 });
      const clock2 = new VectorClock({ client1: 1, client2: 2 });
      
      expect(clock1.happenedBefore(clock2)).toBe(false);
      expect(clock2.happenedBefore(clock1)).toBe(false);
    });
  });

  describe('isConcurrentWith', () => {
    test('should detect concurrent clocks', () => {
      const clock1 = new VectorClock({ client1: 5, client2: 1 });
      const clock2 = new VectorClock({ client1: 3, client2: 7 });
      
      expect(clock1.isConcurrentWith(clock2)).toBe(true);
    });

    test('should return false when one clock happened before another', () => {
      const earlier = new VectorClock({ client1: 1, client2: 2 });
      const later = new VectorClock({ client1: 2, client2: 3 });
      
      expect(earlier.isConcurrentWith(later)).toBe(false);
      expect(later.isConcurrentWith(earlier)).toBe(false);
    });
  });

  describe('equals', () => {
    test('should return true for identical clocks', () => {
      const clock1 = new VectorClock({ client1: 1, client2: 2 });
      const clock2 = new VectorClock({ client1: 1, client2: 2 });
      
      expect(clock1.equals(clock2)).toBe(true);
    });

    test('should return false for different clocks', () => {
      const clock1 = new VectorClock({ client1: 1, client2: 2 });
      const clock2 = new VectorClock({ client1: 1, client2: 3 });
      
      expect(clock1.equals(clock2)).toBe(false);
    });

    test('should return false for clocks with different clients', () => {
      const clock1 = new VectorClock({ client1: 1, client2: 2 });
      const clock2 = new VectorClock({ client1: 1, client3: 2 });
      
      expect(clock1.equals(clock2)).toBe(false);
    });
  });

  describe('clone', () => {
    test('should create a new instance with the same values', () => {
      const original = new VectorClock({ client1: 1, client2: 2 });
      const clone = original.clone();
      
      expect(clone).not.toBe(original);
      expect(clone.getClocks()).toEqual(original.getClocks());
    });
  });

  describe('toString', () => {
    test('should return JSON representation of clocks', () => {
      const clock = new VectorClock({ client1: 1, client2: 2 });
      expect(clock.toString()).toBe('{"client1":1,"client2":2}');
    });
  });
});