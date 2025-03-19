import React from 'react';
import { ProgressBar } from '../common/ProgressBar';
import { formatNumber } from '../../utils/formatters';

interface UsageDisplayProps {
  used: number;
  limit: number;
  percentUsed: number;
  theme: 'success' | 'warning' | 'danger';
  compact?: boolean;
}

export const UsageDisplay: React.FC<UsageDisplayProps> = ({
  used,
  limit,
  percentUsed,
  theme,
  compact = false
}) => {
  return (
    <div className="usage-display">
      {compact ? (
        <div className="flex items-center space-x-3">
          <ProgressBar 
            percentage={percentUsed} 
            theme={theme}
            height={6} 
            className="flex-grow" 
          />
          <span className="text-xs font-medium whitespace-nowrap">
            {formatNumber(used)} / {formatNumber(limit)}
          </span>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center space-x-2">
              <div className={`h-2 w-2 rounded-full bg-${theme}-500`}></div>
              <span className="text-sm font-medium">
                {percentUsed}% used
              </span>
            </div>
            {percentUsed > 80 && (
              <span className={`text-xs text-${theme}-600 font-medium`}>
                {theme === 'warning' ? 'Approaching limit' : 'Critical level'}
              </span>
            )}
          </div>
          <ProgressBar 
            percentage={percentUsed} 
            theme={theme} 
            height={8}
          />
        </div>
      )}
    </div>
  );
};