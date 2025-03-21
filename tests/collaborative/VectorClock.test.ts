import { VectorClock } from '../../src/collaborative/VectorClock';

describe('VectorClock', () => {
  describe('construction', () => {
    test('initializes empty when no parameters are provided', () => {
      const clock = new VectorClock();
      expect(clock.getClock()).toEqual({});
    });

    test('initializes with user ID incremented when provided', () => {
      const clock = new VectorClock('user-1');
      expect(clock.getClock()).toEqual({ 'user-1': 1 });
    });

    test('initializes with existing clock values when provided', () => {
      const initialClock = { 'user-1': 3, 'user-2': 2 };
      const clock = new VectorClock(undefined, initialClock);
      expect(clock.getClock()).toEqual(initialClock);
    });
  });

  describe('increment', () => {
    test('increments value for new user ID', () => {
      const clock = new VectorClock();
      clock.increment('user-1');
      expect(clock.getClock()['user-1']).toBe(1);
    });

    test('increments existing user ID correctly', () => {
      const clock = new VectorClock('user-1');
      clock.increment('user-1');
      expect(clock.getClock()['user-1']).toBe(2);
    });
  });

  describe('compare', () => {
    test('returns 0 for identical clocks', () => {
      const clock1 = new VectorClock('user-1');
      const clock2 = new VectorClock('user-1');
      expect(clock1.compare(clock2)).toBe(0);
    });

    test('returns -1 when this clock happens before other', () => {
      const clock1 = new VectorClock('user-1');
      const clock2 = new VectorClock('user-1');
      clock2.increment('user-1');
      expect(clock1.compare(clock2)).toBe(-1);
    });

    test('returns 1 when this clock happens after other', () => {
      const clock1 = new VectorClock('user-1');
      clock1.increment('user-1');
      const clock2 = new VectorClock('user-1');
      expect(clock1.compare(clock2)).toBe(1);
    });

    test('returns 0 for concurrent operations with different users', () => {
      const clock1 = new VectorClock('user-1');
      const clock2 = new VectorClock('user-2');
      expect(clock1.compare(clock2)).toBe(0);
    });

    test('handles complex causality relationships', () => {
      const clock1 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      const clock2 = new VectorClock(undefined, { 'user-1': 2, 'user-2': 2 });
      expect(clock1.compare(clock2)).toBe(0); // Concurrent
      
      const clock3 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 2 });
      expect(clock1.compare(clock3)).toBe(-1); // clock1 happens before clock3
      
      const clock4 = new VectorClock(undefined, { 'user-1': 1, 'user-2': 1 });
      expect(clock1.compare(clock4)).toBe(1); // clock1 happens after clock4
    });

    test('compares against raw clock objects', () => {
      const clock = new VectorClock('user-1');
      expect(clock.compare({ 'user-1': 1 })).toBe(0); // Equal
      expect(clock.compare({ 'user-1': 2 })).toBe(-1); // Before
      expect(clock.compare({ 'user-1': 0 })).toBe(1); // After
    });
  });

  describe('merge', () => {
    test('merges two clocks taking maximum values', () => {
      const clock1 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      const clock2 = new VectorClock(undefined, { 'user-1': 2, 'user-2': 2, 'user-3': 1 });
      
      clock1.merge(clock2);
      
      expect(clock1.getClock()).toEqual({
        'user-1': 3,
        'user-2': 2,
        'user-3': 1
      });
    });

    test('merges with raw clock object', () => {
      const clock = new VectorClock('user-1');
      clock.merge({ 'user-1': 3, 'user-2': 1 });
      
      expect(clock.getClock()).toEqual({
        'user-1': 3,
        'user-2': 1
      });
    });
  });

  describe('equals', () => {
    test('returns true for identical clocks', () => {
      const clock1 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      const clock2 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      
      expect(clock1.equals(clock2)).toBe(true);
    });

    test('returns false for different clocks', () => {
      const clock1 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      const clock2 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 2 });
      
      expect(clock1.equals(clock2)).toBe(false);
    });

    test('handles different keys correctly', () => {
      const clock1 = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      const clock2 = new VectorClock(undefined, { 'user-1': 3, 'user-3': 1 });
      
      expect(clock1.equals(clock2)).toBe(false);
    });

    test('checks equality with raw clock object', () => {
      const clock = new VectorClock(undefined, { 'user-1': 3, 'user-2': 1 });
      
      expect(clock.equals({ 'user-1': 3, 'user-2': 1 })).toBe(true);
      expect(clock.equals({ 'user-1': 3, 'user-2': 2 })).toBe(false);
    });
  });
});