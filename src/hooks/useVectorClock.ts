import { useState, useEffect, useCallback } from 'react';
import { VectorClock } from '../collaborative/VectorClock';
import { useWebSocket } from './useWebSocket'; // Assume this hook exists for WebSocket communication

/**
 * Hook to manage vector clocks for collaborative editing
 */
export function useVectorClock(documentId: string, userId: string) {
  const [vectorClock, setVectorClock] = useState<VectorClock>(new VectorClock(userId));
  const socket = useWebSocket();
  
  // Initialize and set up listeners when component mounts
  useEffect(() => {
    if (!socket || !documentId || !userId) return;
    
    // Listen for remote clock updates
    socket.on('vector_clock_update', (data) => {
      if (data.documentId === documentId) {
        // Create a new vector clock to ensure React detects the state change
        const updatedClock = new VectorClock(undefined, vectorClock.getClock());
        updatedClock.merge(data.clock);
        setVectorClock(updatedClock);
      }
    });
    
    // Send initial clock state
    socket.emit('join_document', {
      documentId,
      userId,
      vectorClock: vectorClock.getClock()
    });
    
    // Clean up listeners when component unmounts
    return () => {
      socket.off('vector_clock_update');
    };
  }, [socket, documentId, userId]);
  
  // Function to increment local clock and broadcast to other clients
  const incrementClock = useCallback(() => {
    if (!socket) return;
    
    // Increment local clock
    const updatedClock = new VectorClock(undefined, vectorClock.getClock());
    updatedClock.increment(userId);
    setVectorClock(updatedClock);
    
    // Broadcast update
    socket.emit('vector_clock_update', {
      documentId,
      userId,
      clock: updatedClock.getClock()
    });
    
    return updatedClock;
  }, [socket, vectorClock, documentId, userId]);
  
  // Function to check if operations are concurrent
  const areConcurrent = useCallback((otherClock: Record<string, number>): boolean => {
    return vectorClock.compare(otherClock) === 0;
  }, [vectorClock]);
  
  return {
    vectorClock,
    incrementClock,
    areConcurrent
  };
}