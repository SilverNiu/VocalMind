import { motion, AnimatePresence } from 'motion/react';
import { InteractionState, EmotionState } from '../types';
import { SoundWave } from './SoundWave';
import { cn } from '../lib/utils';

interface AvatarProps {
  state: InteractionState;
  emotion: EmotionState;
}

export function Avatar({ state, emotion }: AvatarProps) {
  const isIdle = state === 'idle';
  const isListening = state === 'listening';
  const isAnalyzing = state === 'analyzing';
  const isComfort = state === 'comfort' || (state === 'feedback' && (emotion === 'anxious' || emotion === 'tired'));
  const isFeedback = state === 'feedback';

  // Float animation for the whole avatar
  const floatAnim = {
    y: isListening ? [-5, 5, -5] : [-12, 12, -12],
    transition: {
      duration: isListening ? 2 : (isComfort ? 5 : 4),
      repeat: Infinity,
      ease: 'easeInOut',
    },
  };

  // Ear/Side bumps animation for listening
  const earAnim = isListening ? {
    scale: [1, 1.05, 1],
    x: [-2, 2, -2],
    transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' }
  } : { scale: 1, x: 0 };

  const rightEarAnim = isListening ? {
    scale: [1, 1.05, 1],
    x: [2, -2, 2],
    transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
  } : { scale: 1, x: 0 };

  // Core glow colors based on state
  let coreColor = 'from-orange-100 to-amber-50';
  let coreGlow = 'rgba(255, 200, 150, 0.6)';
  if (isListening) {
    coreColor = 'from-blue-100 to-cyan-50';
    coreGlow = 'rgba(100, 200, 255, 0.8)';
  } else if (isAnalyzing) {
    coreColor = 'from-indigo-100 to-purple-50';
    coreGlow = 'rgba(150, 150, 255, 0.8)';
  } else if (isComfort) {
    coreColor = 'from-rose-100 to-orange-50';
    coreGlow = 'rgba(255, 180, 150, 0.6)';
  } else if (isFeedback) {
    coreColor = 'from-teal-100 to-emerald-50';
    coreGlow = 'rgba(100, 255, 200, 0.6)';
  }

  return (
    <div className="relative w-[450px] h-[350px] flex items-center justify-center">
      
      {/* Surrounding Ambient Orbs & Rings (Analyzing / Listening) */}
      <AnimatePresence>
        {(isListening || isAnalyzing) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            {/* Outer large ring */}
            <motion.div 
              animate={{ rotate: 360, scale: isAnalyzing ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="absolute w-[380px] h-[380px] rounded-full border-[1px] border-dashed border-blue-300/30"
            />
            
            {/* Inner orbit ring with particles for analyzing */}
            {isAnalyzing && (
              <motion.div 
                animate={{ rotate: -360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="absolute w-[280px] h-[280px] rounded-full border border-indigo-300/20"
              >
                <div className="absolute top-0 left-1/2 w-3 h-3 bg-indigo-300 rounded-full shadow-[0_0_10px_rgba(165,180,252,0.8)] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-purple-300 rounded-full shadow-[0_0_10px_rgba(216,180,254,0.8)] -translate-x-1/2 translate-y-1/2" />
              </motion.div>
            )}

            {/* Listening ripples */}
            {isListening && (
              <motion.div 
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                className="absolute w-[300px] h-[300px] rounded-full border-2 border-blue-300/40"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Avatar Entity */}
      <motion.div
        animate={floatAnim}
        className="relative z-10 w-[300px] h-[220px]"
        style={{ filter: 'drop-shadow(0 25px 45px rgba(100,150,255,0.15))' }}
      >
        {/* Cloud Body Components (Overlapping to form a single shape) */}
        <div className="absolute inset-0">
          
          {/* Top Center Bump */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[150px] rounded-full bg-gradient-to-b from-white/95 to-white/70 shadow-[inset_0_4px_10px_rgba(255,255,255,1)]" />
          
          {/* Left Bump */}
          <motion.div 
            animate={earAnim}
            className="absolute top-10 left-4 w-[110px] h-[110px] rounded-full bg-gradient-to-bl from-white/90 to-blue-50/80 shadow-[inset_4px_4px_10px_rgba(255,255,255,0.8)]" 
          />
          
          {/* Right Bump */}
          <motion.div 
            animate={rightEarAnim}
            className="absolute top-10 right-4 w-[110px] h-[110px] rounded-full bg-gradient-to-br from-white/90 to-blue-50/80 shadow-[inset_-4px_4px_10px_rgba(255,255,255,0.8)]" 
          />
          
          {/* Bottom Base */}
          <div className="absolute bottom-4 left-4 right-4 h-[120px] rounded-[60px] bg-gradient-to-b from-white/60 to-blue-100/40 shadow-[inset_0_-10px_20px_rgba(255,255,255,0.6)] backdrop-blur-sm" />

          {/* Sparkles / Highlights on the body */}
          <div className="absolute top-6 left-[25%] w-2 h-2 bg-white rounded-full blur-[1px] opacity-80" />
          <div className="absolute top-10 right-[25%] w-3 h-3 bg-white rounded-full blur-[2px] opacity-70" />
        </div>

        {/* Face Elements */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 z-20">
          
          {/* Eyes */}
          <div className="flex gap-14 items-center justify-center">
            {/* Left Eye */}
            <motion.div 
              animate={{ 
                height: isComfort ? 6 : (isAnalyzing ? 22 : 24),
                scaleY: isComfort ? 0.6 : 1,
                y: isComfort ? 5 : 0
              }}
              className="w-6 bg-[#1a2b4c] rounded-full shadow-sm relative overflow-hidden"
              style={{ minHeight: '6px' }}
            >
              <div className="absolute top-1.5 right-1 w-2 h-2 bg-white rounded-full opacity-90" />
              <div className="absolute bottom-1.5 left-1 w-1 h-1 bg-white/60 rounded-full" />
            </motion.div>
            
            {/* Right Eye */}
            <motion.div 
              animate={{ 
                height: isComfort ? 6 : (isAnalyzing ? 22 : 24),
                scaleY: isComfort ? 0.6 : 1,
                y: isComfort ? 5 : 0
              }}
              className="w-6 bg-[#1a2b4c] rounded-full shadow-sm relative overflow-hidden"
              style={{ minHeight: '6px' }}
            >
               <div className="absolute top-1.5 right-1 w-2 h-2 bg-white rounded-full opacity-90" />
               <div className="absolute bottom-1.5 left-1 w-1 h-1 bg-white/60 rounded-full" />
            </motion.div>
          </div>

          {/* Mouth */}
          <motion.svg 
            className="w-8 h-4 mt-5 relative z-20 text-[#1a2b4c]/70" 
            viewBox="0 0 24 12" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round"
            animate={{
              scaleX: isFeedback ? 1.2 : (isListening ? 0.8 : 1),
              scaleY: isFeedback ? 1.5 : (isListening ? 1.2 : 1),
              y: isComfort ? 3 : 0
            }}
          >
            <path d={isListening ? "M8 6 Q12 8 16 6" : (isFeedback ? "M4 2 Q12 12 20 2" : "M6 4 Q12 10 18 4")} />
          </motion.svg>
        </div>

        {/* Central Glowing Core (Voiceprint / Emotion Core) */}
        <motion.div 
          animate={{
            scale: isAnalyzing ? [1, 1.15, 1] : (isListening ? [1, 1.05, 1] : 1),
            boxShadow: `0 0 50px ${coreGlow}, inset 0 0 20px rgba(255,255,255,0.8)`
          }}
          transition={{ duration: isAnalyzing ? 1.2 : 2, repeat: Infinity, ease: 'easeInOut' }}
          className={cn(
            "absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full flex items-center justify-center backdrop-blur-md z-30 transition-colors duration-1000",
            `bg-gradient-to-br ${coreColor}`
          )}
        >
          {/* Inner protective sphere */}
          <div className="absolute inset-2 rounded-full border border-white/40 bg-white/20" />
          
          <SoundWave state={state} className="relative z-10" />
        </motion.div>

        {/* Cloud Arms (Holding the core) */}
        <div className="absolute bottom-6 left-16 w-12 h-12 rounded-full bg-gradient-to-tr from-white/90 to-blue-50/60 shadow-sm z-40" />
        <div className="absolute bottom-6 right-16 w-12 h-12 rounded-full bg-gradient-to-tl from-white/90 to-blue-50/60 shadow-sm z-40" />
      </motion.div>
      
      {/* Ground Ripple / Shadow */}
      <motion.div 
        animate={{
           scale: isListening ? [1, 1.3, 1] : [1, 1.1, 1],
           opacity: isAnalyzing ? [0.4, 0.2, 0.4] : [0.2, 0.1, 0.2]
        }}
        transition={{ duration: isListening ? 2 : 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-4 w-[240px] h-[20px] rounded-[100%] bg-blue-300/40 blur-md pointer-events-none" 
      />
      {/* Secondary Ripple */}
      <motion.div 
        animate={{
           scale: [1, 1.5, 1],
           opacity: [0, 0.2, 0]
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeOut', delay: 1 }}
        className="absolute -bottom-4 w-[280px] h-[24px] rounded-[100%] border border-blue-200/50 pointer-events-none" 
      />
    </div>
  );
}

