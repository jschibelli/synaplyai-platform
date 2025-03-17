import { VectorClock } from '../../src/collaboration/conflict/VectorClock';

describe('VectorClock', () => {
  test('should correctly initialize with empty clock', () => {
    const clock = new VectorClock();
    expect(clock.getClock()).toEqual({});
  });
  
  test('should correctly initialize with provided clock values', () => {
    const clock = new VectorClock({ client1: 1, client2: 2 });
    expect(clock.getClock()).toEqual({ client1: 1, client2: 2 });
  });
  
  test('should increment client counter', () => {
    const clock = new VectorClock();
    
    const updated = clock.increment('client1');
    expect(updated.getClock()).toEqual({ client1: 1 });
    
    const updatedAgain = updated.increment('client1');
    expect(updatedAgain.getClock()).toEqual({ client1: 2 });
  });
  
  test('should correctly merge clocks', () => {
    const clock1 = new VectorClock({ client1: 2, client2: 1 });
    const clock2 = new VectorClock({ client2: 3, client3: 1 });
    
    const merged = clock1.merge(clock2);
    
    // Should take maximum values from both clocks
    expect(merged.getClock()).toEqual({
      client1: 2,
      client2: 3,
      client3: 1
    });
  });
  
  test('should detect concurrent operations', () => {
    // Clock 1: client1 has seen 2 ops from itself, 1 from client2
    const clock1 = new VectorClock({ client1: 2, client2: 1 });
    
    // Clock 2: client2 has seen 2 ops from itself, 1 from client1
    const clock2 = new VectorClock({ client1: 1, client2: 2 });
    
    // These are concurrent because each has operations the other hasn't seen
    expect(clock1.isConcurrentWith(clock2)).toBe(true);
  });
  
  test('should detect happened-before relationship', () => {
    // Clock 1: client1 has seen 2 ops from itself, 1 from client2
    const clock1 = new VectorClock({ client1: 2, client2: 1 });
    
    // Clock 2: client2 has seen 2 ops from itself, 2 from client1
    const clock2 = new VectorClock({ client1: 2, client2: 2 });
    
    // Clock2 happened after clock1
    expect(clock1.isConcurrentWith(clock2)).toBe(false);
    expect(clock1.compare(clock2)).toBe(-1); // clock1 < clock2
  });
  
  test('should detect equal clocks', () => {
    const clock1 = new VectorClock({ client1: 2, client2: 3 });
    const clock2 = new VectorClock({ client1: 2, client2: 3 });
    
    expect(clock1.compare(clock2)).toBe(0); // equal
    expect(clock1.isConcurrentWith(clock2)).toBe(false);
  });
});