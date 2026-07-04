import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { InteractionState } from '../types';

interface SoundWaveProps {
  state: InteractionState;
  className?: string;
}

export function SoundWave({ state, className }: SoundWaveProps) {
  const isActive = state === 'listening' || state === 'analyzing';
  const isComfort = state === 'comfort' || state === 'feedback';

  const getAnimationProps = (index: number) => {
    if (isActive) {
      return {
        height: ['20%', '80%', '20%'],
        transition: {
          duration: 0.5 + Math.random() * 0.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: index * 0.1,
        },
      };
    }
    if (isComfort) {
      return {
        height: ['30%', '50%', '30%'],
        transition: {
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: index * 0.2,
        },
      };
    }
    // Idle
    return {
      height: ['20%', '30%', '20%'],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: index * 0.2,
      },
    };
  };

  const bars = Array.from({ length: 5 });

  return (
    <div className={cn('flex items-center justify-center gap-[3px] h-8', className)}>
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-orange-200/80"
          animate={getAnimationProps(i)}
          initial={{ height: '20%' }}
        />
      ))}
    </div>
  );
}
