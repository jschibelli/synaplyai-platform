import { VectorClock } from '../../src/collaborative/VectorClock';

describe('VectorClock', () => {
  test('initializes correctly', () => {
    const clock = new VectorClock('user-1');
    expect(clock.getClock()).toEqual({ 'user-1': 1 });
  });

  test('initializes with existing clock values', () => {
    const initialClock = { 'user-1': 3, 'user-2': 2 };
    const clock = new VectorClock(undefined, initialClock);
    expect(clock.getClock()).toEqual(initialClock);
  });

  test('increments values correctly', () => {
    const clock = new VectorClock();
    
    clock.increment('user-1');
    expect(clock.getClock()['user-1']).toBe(1);
    
    clock.increment('user-1');
    expect(clock.getClock()['user-1']).toBe(2);
    
    clock.increment('user-2');
    expect(clock.getClock()['user-2']).toBe(1);
  });

  test('compares correctly when happens before', () => {
    const clock1 = new VectorClock();
    clock1.increment('user-1');
    
    const clock2 = new VectorClock();
    clock2.increment('user-1');
    clock2.increment('user-1');
    
    expect(clock1.compare(clock2)).toBe(-1); // clock1 happens before clock2
  });

  test('compares correctly when happens after', () => {
    const clock1 = new VectorClock();
    clock1.increment('user-1');
    clock1.increment('user-1');
    
    const clock2 = new VectorClock();
    clock2.increment('user-1');
    
    expect(clock1.compare(clock2)).toBe(1); // clock1 happens after clock2
  });

  test('compares correctly when concurrent', () => {
    const clock1 = new VectorClock();
    clock1.increment('user-1');
    
    const clock2 = new VectorClock();
    clock2.increment('user-2');
    
    expect(clock1.compare(clock2)).toBe(0); // clock1 and clock2 are concurrent
  });

  test('merges correctly', () => {
    const clock1 = new VectorClock();
    clock1.increment('user-1');
    clock1.increment('user-1');
    clock1.increment('user-2');
    
    const clock2 = new VectorClock();
    clock2.increment('user-2');
    clock2.increment('user-2');
    clock2.increment('user-3');
    
    // Merge clock2 into clock1
    clock1.merge(clock2);
    
    // Should take maximum values from both clocks
    expect(clock1.getClock()).toEqual({
      'user-1': 2, // From clock1
      'user-2': 2, // Max from clock1 and clock2
      'user-3': 1  // From clock2
    });
  });

  test('equals checks clocks correctly', () => {
    const clock1 = new VectorClock('user-1');
    const clock2 = new VectorClock('user-1');
    const clock3 = new VectorClock('user-2');
    
    expect(clock1.equals(clock2)).toBe(true);
    expect(clock1.equals(clock3)).toBe(false);
    
    // Test with raw objects
    expect(clock1.equals({ 'user-1': 1 })).toBe(true);
    expect(clock1.equals({ 'user-1': 2 })).toBe(false);
  });
});