import React, { useState, useEffect } from 'react';
import { BreakerState } from '../../circuit-breaker/tenant-breaker';

interface BreakerStatusProps {
  tenantId: string;
  service: string;
  onStateChange?: (state: BreakerState) => void;
}

export function BreakerStatus({ tenantId, service, onStateChange }: BreakerStatusProps) {
  const [status, setStatus] = useState<BreakerState>(BreakerState.CLOSED);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    
    const fetchBreakerStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/circuit-breaker/status?tenantId=${encodeURIComponent(tenantId)}&service=${encodeURIComponent(service)}`,
          { signal: controller.signal }
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch breaker status: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (isMounted) {
          setStatus(data.state);
          setLastUpdated(new Date(data.timestamp));
          setError(null);
          
          if (onStateChange) {
            onStateChange(data.state);
          }
        }
      } catch (err: any) {
        if (isMounted && err.name !== 'AbortError') {
          setError(`Error fetching circuit breaker status: ${err.message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    // Initial fetch
    fetchBreakerStatus();
    
    // Set up polling (every 10 seconds)
    const intervalId = setInterval(fetchBreakerStatus, 10000);
    
    // Set up event source for real-time updates
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === 'circuit-state-change' &&
          data.tenantId === tenantId &&
          data.service === service &&
          isMounted
        ) {
          setStatus(data.newState);
          setLastUpdated(new Date(data.timestamp));
          
          if (onStateChange) {
            onStateChange(data.newState);
          }
        }
      } catch (err) {
        console.error('Error processing EventSource message:', err);
      }
    };
    
    eventSource.onerror = () => {
      console.error('EventSource error, falling back to polling');
    };
    
    // Cleanup
    return () => {
      isMounted = false;
      clearInterval(intervalId);
      controller.abort();
      eventSource.close();
    };
  }, [tenantId, service, onStateChange]);
  
  // Helper to get the appropriate color for the status
  const getStatusColor = () => {
    switch (status) {
      case BreakerState.CLOSED:
        return 'bg-green-500';
      case BreakerState.HALF_OPEN:
        return 'bg-yellow-500';
      case BreakerState.OPEN:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 my-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="rounded-md bg-blue-50 p-4 my-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Loading...</h3>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-md bg-white p-4 my-4 shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">{service}</h3>
        <div className={`px-4 py-2 rounded-full text-white ${getStatusColor()}`}>
          {status}
        </div>
      </div>
      <div className="text-sm text-gray-600">
        <div>Tenant: {tenantId}</div>
        <div>Last updated: {lastUpdated.toLocaleString()}</div>
        <div className="mt-2">
          Connection: {connected ? 'Live' : 'Polling'}
        </div>
      </div>
    </div>
  );
}