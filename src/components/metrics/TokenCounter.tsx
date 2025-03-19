import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface TokenCounterProps {
  current: number;
  className?: string;
}

export const TokenCounter: React.FC<TokenCounterProps> = ({ current, className }) => {
  return (
    <div className={`token-counter ${className || ''}`}>
      <h3>Token Usage</h3>
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="token-count"
        >
          {current.toLocaleString()}
        </motion.div>
      </AnimatePresence>
      <p className="token-label">tokens used</p>
    </div>
  );
};