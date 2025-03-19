import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThresholdWarningProps {
  warning: number;
  critical: number;
  current: number;
  className?: string;
}

export const ThresholdWarning: React.FC<ThresholdWarningProps> = ({
  warning,
  critical,
  current,
  className
}) => {
  const getThresholdStatus = () => {
    if (current >= critical) return 'critical';
    if (current >= warning) return 'warning';
    return 'normal';
  };

  const getStatusColor = () => {
    switch (getThresholdStatus()) {
      case 'critical':
        return {
          text: 'text-red-700',
          bg: 'bg-red-100',
          border: 'border-red-300'
        };
      case 'warning':
        return {
          text: 'text-yellow-700',
          bg: 'bg-yellow-100',
          border: 'border-yellow-300'
        };
      default:
        return {
          text: 'text-green-700',
          bg: 'bg-green-100',
          border: 'border-green-300'
        };
    }
  };

  const colors = getStatusColor();

  return (
    <div className={`threshold-warning p-4 rounded-lg border ${colors.bg} ${colors.border} ${className || ''}`}>
      <h3 className={`text-lg font-semibold mb-2 ${colors.text}`}>Resource Usage</h3>

      <div className="relative pt-1">
        <div className="flex mb-2 items-center justify-between">
          <div>
            <span className={`text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${colors.bg} ${colors.text}`}>
              {getThresholdStatus()}
            </span>
          </div>
          <div className="text-right">
            <span className={`text-xs font-semibold inline-block ${colors.text}`}>
              {current}%
            </span>
          </div>
        </div>

        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
          <motion.div
            className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${colors.bg}`}
            initial={{ width: 0 }}
            animate={{ width: `${current}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Warning at:</span>
            <span className="ml-2 font-medium">{warning}%</span>
          </div>
          <div>
            <span className="text-gray-600">Critical at:</span>
            <span className="ml-2 font-medium">{critical}%</span>
          </div>
        </div>

        <AnimatePresence>
          {getThresholdStatus() !== 'normal' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mt-4 p-3 rounded-md ${colors.bg} ${colors.text}`}
            >
              {getThresholdStatus() === 'critical' ? (
                'Critical threshold exceeded! Action required.'
              ) : (
                'Warning threshold reached. Please monitor usage.'
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};