import { useState, useEffect } from 'react';
import { TokenUsage, TokenUsageHistory } from '../types/usage';

export const useTokenUsage = (tenantId: string, startDate?: Date, endDate?: Date) => {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [historicalUsage, setHistoricalUsage] = useState<TokenUsageHistory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsage = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // In a real app, this would be an API call
      const response = await fetch(`/api/usage/tokens?tenantId=${tenantId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch token usage: ${response.status}`);
      }
      
      const data = await response.json();
      setTokenUsage(data);

      if (startDate && endDate) {
        const historyResponse = await fetch(
          `/api/usage/history?tenantId=${tenantId}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`
        );
        
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setHistoricalUsage(historyData);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error fetching token usage'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [tenantId, startDate, endDate]);

  return {
    tokenUsage,
    historicalUsage,
    isLoading,
    error,
    refreshUsage: fetchUsage
  };
};