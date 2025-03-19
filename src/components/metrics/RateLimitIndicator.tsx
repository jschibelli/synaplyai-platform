import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface RateLimitIndicatorProps {
  remaining: number;
  total: number;
  resetAt: string;
  className?: string;
}

export const RateLimitIndicator: React.FC<RateLimitIndicatorProps> = ({
  remaining,
  total,
  resetAt,
  className
}) => {
  const percentage = (remaining / total) * 100;
  const resetTime = new Date(resetAt).toLocaleTimeString();
  
  const getStatusColor = () => {
    if (percentage > 50) return 'bg-green-500';
    if (percentage > 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={`rate-limit-indicator ${className || ''}`}>
      <h3 className="text-lg font-semibold mb-2">Rate Limit Status</h3>
      
      <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className={`absolute left-0 top-0 h-full ${getStatusColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={remaining}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center"
          >
            <p className="text-sm text-gray-600">Remaining</p>
            <p className="text-xl font-bold">{remaining}</p>
          </motion.div>
        </AnimatePresence>

        <div className="text-center">
          <p className="text-sm text-gray-600">Total</p>
          <p className="text-xl font-bold">{total}</p>
        </div>
      </div>

      <p className="mt-2 text-sm text-gray-500 text-center">
        Resets at {resetTime}
      </p>

      {remaining === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-2 p-2 bg-red-100 text-red-700 rounded-md text-center"
        >
          Rate limit exceeded
        </motion.div>
      )}
    </div>
  );
};