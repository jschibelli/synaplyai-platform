import React from 'react';
import { useTenantContext } from '../../hooks/useTenantContext';
import { useTokenUsage } from '../../hooks/useTokenUsage';
import { UsageDisplay } from './UsageDisplay';
import { BudgetTools } from './BudgetTools';
import { formatNumber } from '../../utils/formatters';

interface TokenUsageStatusProps {
  showBudgetTools?: boolean;
  compact?: boolean;
  className?: string;
}

export const TokenUsageStatus: React.FC<TokenUsageStatusProps> = ({
  showBudgetTools = true,
  compact = false,
  className = ''
}) => {
  const { tenantId } = useTenantContext();
  const { tokenUsage, isLoading, error, refreshUsage } = useTokenUsage(tenantId);
  
  const getStatusTheme = (percentUsed: number) => {
    if (percentUsed >= 90) return 'danger';
    if (percentUsed >= 75) return 'warning';
    return 'success';
  };
  
  if (isLoading) {
    return (
      <div className={`token-usage-status ${compact ? 'compact' : ''} ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-500 animate-spin"></div>
          <span className="text-sm text-gray-500">Loading usage...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`token-usage-status error ${compact ? 'compact' : ''} ${className}`}>
        <div className="flex items-center space-x-2 text-red-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">Usage data unavailable</span>
        </div>
      </div>
    );
  }

  if (!tokenUsage) {
    return (
      <div className={`token-usage-status empty ${compact ? 'compact' : ''} ${className}`}>
        <div className="flex items-center space-x-2 text-gray-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">No usage data</span>
        </div>
      </div>
    );
  }

  // Calculate percentage used
  const percentUsed = Math.round((tokenUsage.used / tokenUsage.limit) * 100);
  const theme = getStatusTheme(percentUsed);
  const tokensRemaining = tokenUsage.limit - tokenUsage.used;

  return (
    <div className={`token-usage-status ${compact ? 'compact' : ''} ${className}`}>
      <div className="usage-container">
        {!compact && (
          <div className="mb-2 flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-700">Token Usage</h3>
            <span className="text-xs text-gray-500">
              Resets on {new Date(tokenUsage.resetDate).toLocaleDateString()}
            </span>
          </div>
        )}
        
        <UsageDisplay 
          used={tokenUsage.used}
          limit={tokenUsage.limit}
          percentUsed={percentUsed}
          theme={theme}
          compact={compact}
        />
        
        {!compact && (
          <div className="mt-2 flex justify-between items-center text-xs text-gray-600">
            <span>{formatNumber(tokenUsage.used)} used</span>
            <span>{formatNumber(tokensRemaining)} remaining</span>
          </div>
        )}
        
        {showBudgetTools && !compact && (
          <div className="mt-4">
            <BudgetTools 
              currentUsage={tokenUsage.used}
              limit={tokenUsage.limit}
              plan={tokenUsage.plan}
            />
          </div>
        )}
      </div>
    </div>
  );
};