import React from 'react';

interface ProgressBarProps {
  percentage: number;
  theme?: 'success' | 'warning' | 'danger' | 'primary';
  height?: number;
  showPercentage?: boolean;
  className?: string;
  animate?: boolean;
  label?: string;
  ariaLabel?: string;
}

/**
 * A reusable progress bar component that supports different themes, animations,
 * and accessibility features
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage,
  theme = 'primary',
  height = 8,
  showPercentage = false,
  className = '',
  animate = true,
  label,
  ariaLabel
}) => {
  // Ensure percentage is between 0 and 100
  const validPercentage = Math.min(100, Math.max(0, percentage));
  
  // Get the appropriate theme class
  const getThemeClass = () => {
    switch (theme) {
      case 'success': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'danger': return 'bg-red-500';
      case 'primary':
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className={`progress-container w-full ${className}`}>
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-sm text-gray-600">{label}</span>
          {showPercentage && (
            <span className="text-sm text-gray-600">{validPercentage}%</span>
          )}
        </div>
      )}
      
      <div 
        className="progress-bar-background bg-gray-200 rounded-full overflow-hidden"
        style={{ height: `${height}px` }}
        role="progressbar"
        aria-valuenow={validPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel || label || `${validPercentage}% complete`}
      >
        <div
          className={`progress-bar-fill h-full ${getThemeClass()} ${animate ? 'transition-all duration-500 ease-in-out' : ''}`}
          style={{ width: `${validPercentage}%` }}
        />
      </div>
      
      {!label && showPercentage && (
        <div className="progress-percentage text-xs text-gray-600 mt-1 text-right">
          {validPercentage}%
        </div>
      )}
    </div>
  );
};