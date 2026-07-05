import { motion } from 'motion/react';
import { InteractionState } from '../types';
import { cn } from '../lib/utils';

interface SoundWaveProps {
  state: InteractionState;
  className?: string;
}

export function SoundWave({ state, className }: SoundWaveProps) {
  const isActive = state === 'listening' || state === 'analyzing';
  const isComfort = state === 'comfort' || state === 'feedback';

  const wavePath = isActive
    ? 'M5 32 H21 C28 32 26 9 34 9 C43 9 39 49 49 49 C59 49 55 18 65 18 C72 18 72 32 79 32 H91'
    : isComfort
      ? 'M5 33 H23 C29 33 29 23 35 23 C43 23 40 43 49 43 C57 43 55 27 64 27 C70 27 71 33 78 33 H91'
      : 'M5 33 H23 C29 33 29 25 35 25 C43 25 40 42 49 42 C57 42 55 28 64 28 C70 28 71 33 78 33 H91';

  return (
    <motion.svg
      className={cn('h-14 w-24 overflow-visible text-white', className)}
      viewBox="0 0 96 60"
      fill="none"
      aria-hidden="true"
      animate={{ scale: isActive ? [1, 1.05, 1] : 1 }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.path
        d={wavePath}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
        style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.9))' }}
        initial={false}
        animate={{
          pathLength: isActive ? [0.86, 1, 0.86] : [0.94, 1, 0.94],
          opacity: isActive ? [0.82, 1, 0.82] : [0.78, 0.95, 0.78],
        }}
        transition={{
          duration: isActive ? 0.9 : 2.4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </motion.svg>
  );
}
