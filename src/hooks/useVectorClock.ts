import { useEffect, useState } from 'react';
import { VectorClock } from '../collaborative/VectorClock';
import { useSession } from 'next-auth/react';
import { useSocketConnection } from './useSocketConnection';

export function useVectorClock(documentId: string) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const socket = useSocketConnection();
  const [vectorClock, setVectorClock] = useState<VectorClock | null>(null);
  
  useEffect(() => {
    if (!userId || !socket) return;
    
    // Initialize vector clock
    const clock = new VectorClock(userId);
    setVectorClock(clock);
    
    // Listen for remote clock updates
    socket.on('vector_clock_update', (remoteClockData) => {
      clock.merge(remoteClockData);
      setVectorClock(new VectorClock(userId, clock.getClock())); // Create new instance to trigger re-render
    });
    
    // Send initial clock state
    socket.emit('join_document', { documentId, vectorClock: clock.getClock() });
    
    return () => {
      socket.off('vector_clock_update');
    };
  }, [userId, documentId, socket]);
  
  // Increment local clock and broadcast
  const incrementClock = () => {
    if (!vectorClock || !socket) return;
    
    vectorClock.increment(userId);
    socket.emit('vector_clock_update', {
      documentId,
      vectorClock: vectorClock.getClock()
    });
    
    setVectorClock(new VectorClock(userId, vectorClock.getClock()));
  };
  
  return {
    vectorClock,
    incrementClock,
    isReady: !!vectorClock
  };
}