import { motion } from 'framer-motion';

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 py-3 px-4"
      role="status"
      aria-live="polite"
      aria-label="Claude is thinking"
    >
      {/* Pulsing dot - Calm Technology: slow, subtle animation */}
      <motion.div
        className="h-2 w-2 rounded-full bg-primary"
        style={{ willChange: 'transform, opacity' }}
        animate={{
          opacity: [0.4, 1, 0.4],
          scale: [0.95, 1, 0.95],
        }}
        transition={{
          duration: 2, // Slow pulse (Calm Technology)
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Text - muted color for Calm Technology */}
      <span className="text-sm text-muted-foreground">Claude is thinking...</span>
    </motion.div>
  );
}
