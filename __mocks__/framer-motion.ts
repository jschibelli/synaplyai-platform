// In __mocks__/framer-motion.ts
export const motion = {
  div: ({ children, ...props }) => ({ children, ...props })
};

export const AnimatePresence = ({ children }) => children;