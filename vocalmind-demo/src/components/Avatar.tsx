import { AnimatePresence, motion } from 'motion/react';
import { EmotionState, InteractionState } from '../types';
import { SoundWave } from './SoundWave';

interface AvatarProps {
  state: InteractionState;
  emotion: EmotionState;
}

const cloudBubbleStyle = {
  background:
    'radial-gradient(circle at 35% 24%, rgba(255,255,255,1) 0%, rgba(255,255,255,0.96) 32%, rgba(242,248,255,0.9) 62%, rgba(211,229,255,0.8) 100%)',
  boxShadow:
    'inset 0 18px 28px rgba(255,255,255,0.95), inset 0 -24px 42px rgba(129,184,255,0.22), 0 0 0 3px rgba(255,255,255,0.55), 0 22px 45px rgba(112,153,221,0.16)',
};

const glassHighlightStyle = {
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.22) 45%, rgba(255,255,255,0) 70%)',
};

export function Avatar({ state, emotion }: AvatarProps) {
  const isListening = state === 'listening';
  const isAnalyzing = state === 'analyzing';
  const isFeedback = state === 'feedback';
  const isComfort = state === 'comfort' || (state === 'feedback' && (emotion === 'anxious' || emotion === 'tired'));

  const floatAnim = {
    y: isListening ? [-4, 7, -4] : [-10, 10, -10],
    transition: {
      duration: isListening ? 2.2 : isComfort ? 5.4 : 4.6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  };

  const sidePulse = isListening
    ? {
        scale: [1, 1.025, 1],
        transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
      }
    : { scale: 1 };

  const handPulse = isListening
    ? {
        y: [0, -5, 0],
        scale: [1, 1.04, 1],
        transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
      }
    : { y: 0, scale: 1 };

  let coreGlow = 'rgba(255, 213, 154, 0.9)';
  let coreSurface =
    'radial-gradient(circle at 45% 34%, rgba(255,255,255,0.96) 0%, rgba(255,236,193,0.94) 38%, rgba(255,198,124,0.72) 100%)';

  if (isListening) {
    coreGlow = 'rgba(125, 209, 255, 0.86)';
    coreSurface =
      'radial-gradient(circle at 45% 34%, rgba(255,255,255,0.98) 0%, rgba(209,245,255,0.96) 42%, rgba(111,194,255,0.65) 100%)';
  } else if (isAnalyzing) {
    coreGlow = 'rgba(172, 164, 255, 0.86)';
    coreSurface =
      'radial-gradient(circle at 45% 34%, rgba(255,255,255,0.98) 0%, rgba(224,218,255,0.95) 42%, rgba(156,145,255,0.66) 100%)';
  } else if (isComfort) {
    coreGlow = 'rgba(255, 184, 176, 0.82)';
    coreSurface =
      'radial-gradient(circle at 45% 34%, rgba(255,255,255,0.97) 0%, rgba(255,226,207,0.96) 42%, rgba(255,162,137,0.68) 100%)';
  } else if (isFeedback) {
    coreGlow = 'rgba(132, 238, 203, 0.76)';
    coreSurface =
      'radial-gradient(circle at 45% 34%, rgba(255,255,255,0.98) 0%, rgba(208,250,232,0.95) 42%, rgba(92,218,177,0.62) 100%)';
  }

  return (
    <div className="relative flex h-[390px] w-[540px] max-w-[92vw] items-center justify-center">
      <div className="pointer-events-none absolute inset-x-6 top-3 h-[330px] rounded-[50%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.84),rgba(194,218,255,0.22)_47%,rgba(255,255,255,0)_72%)] blur-2xl" />

      <AnimatePresence>
        {(isListening || isAnalyzing) && (
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
          >
            <motion.div
              className="absolute h-[360px] w-[460px] rounded-[50%] border border-white/70 shadow-[0_0_45px_rgba(147,197,253,0.25)]"
              animate={{ scale: isAnalyzing ? [1, 1.04, 1] : [1, 1.08, 1], opacity: [0.45, 0.16, 0.45] }}
              transition={{ duration: isAnalyzing ? 2.2 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            {isAnalyzing && (
              <motion.div
                className="absolute h-[285px] w-[390px] rounded-[50%] border border-dashed border-indigo-200/60"
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={floatAnim}
        className="relative z-10 h-[315px] w-[455px]"
        style={{ filter: 'drop-shadow(0 34px 38px rgba(115,147,208,0.22))' }}
      >
        <motion.div
          className="absolute bottom-[34px] left-[4px] h-[172px] w-[194px] rounded-full"
          animate={sidePulse}
          style={cloudBubbleStyle}
        />
        <motion.div
          className="absolute bottom-[34px] right-[4px] h-[172px] w-[194px] rounded-full"
          animate={sidePulse}
          style={cloudBubbleStyle}
        />
        <motion.div
          className="absolute left-[54px] top-[88px] h-[146px] w-[154px] rounded-full"
          animate={isListening ? { x: [-2, 2, -2], ...sidePulse } : sidePulse}
          style={cloudBubbleStyle}
        />
        <motion.div
          className="absolute right-[54px] top-[88px] h-[146px] w-[154px] rounded-full"
          animate={isListening ? { x: [2, -2, 2], ...sidePulse } : sidePulse}
          style={cloudBubbleStyle}
        />
        <div className="absolute left-1/2 top-[8px] h-[190px] w-[214px] -translate-x-1/2 rounded-full" style={cloudBubbleStyle} />
        <div
          className="absolute bottom-[22px] left-1/2 h-[172px] w-[338px] -translate-x-1/2 rounded-[48%_48%_44%_44%/56%_56%_44%_44%]"
          style={{
            ...cloudBubbleStyle,
            background:
              'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.9) 38%, rgba(232,243,255,0.78) 72%, rgba(205,226,255,0.72) 100%)',
          }}
        />

        <div className="absolute left-[58px] top-[66px] h-[106px] w-[148px] rotate-[-8deg] rounded-full opacity-55 blur-[1px]" style={glassHighlightStyle} />
        <div className="absolute right-[65px] top-[82px] h-[96px] w-[132px] rotate-[9deg] rounded-full opacity-45 blur-[1px]" style={glassHighlightStyle} />
        <div className="absolute bottom-[62px] left-[22px] h-[95px] w-[145px] rounded-full bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.42),rgba(155,198,255,0.12)_55%,rgba(255,255,255,0)_78%)]" />
        <div className="absolute bottom-[62px] right-[22px] h-[95px] w-[145px] rounded-full bg-[radial-gradient(circle_at_68%_32%,rgba(255,255,255,0.42),rgba(155,198,255,0.12)_55%,rgba(255,255,255,0)_78%)]" />

        <div className="absolute left-1/2 top-[126px] z-30 flex -translate-x-1/2 items-center gap-[92px]">
          {['left', 'right'].map((eye) => (
            <motion.div
              key={eye}
              className="relative h-[48px] w-[48px] overflow-hidden rounded-full"
              animate={{
                scaleY: isComfort ? [1, 0.72, 1] : isAnalyzing ? [1, 0.92, 1] : 1,
                y: isComfort ? 3 : 0,
              }}
              transition={{ duration: isComfort ? 2.6 : 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                background:
                  'radial-gradient(circle at 34% 28%, #ffffff 0 14%, #dfe9ff 15% 20%, #142352 42%, #07153b 100%)',
                boxShadow:
                  'inset -8px -10px 14px rgba(7,18,61,0.68), inset 7px 8px 12px rgba(71,104,190,0.38), 0 5px 10px rgba(20,35,82,0.2)',
              }}
            >
              <div className="absolute left-[11px] top-[8px] h-[17px] w-[17px] rounded-full bg-white" />
              <div className="absolute bottom-[12px] right-[10px] h-[8px] w-[8px] rounded-full bg-white/76" />
              <div className="absolute inset-x-[7px] bottom-[5px] h-[9px] rounded-full bg-blue-300/18 blur-sm" />
            </motion.div>
          ))}
        </div>

        <div className="absolute left-[164px] top-[160px] z-30 h-[24px] w-[54px] rounded-full bg-[radial-gradient(circle,rgba(255,147,174,0.36)_0%,rgba(255,196,208,0.16)_48%,rgba(255,255,255,0)_74%)] blur-[1px]" />
        <div className="absolute right-[164px] top-[160px] z-30 h-[24px] w-[54px] rounded-full bg-[radial-gradient(circle,rgba(255,147,174,0.36)_0%,rgba(255,196,208,0.16)_48%,rgba(255,255,255,0)_74%)] blur-[1px]" />

        <motion.svg
          className="absolute left-1/2 top-[147px] z-[60] h-[28px] w-[52px] -translate-x-1/2 overflow-visible"
          viewBox="0 0 52 28"
          fill="none"
          animate={{
            scaleX: isFeedback ? 1.12 : isListening ? 0.92 : 1,
            y: isComfort ? 2 : 0,
          }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <motion.path
            d={isListening ? 'M14 13 C20 22 32 22 38 13' : isComfort ? 'M14 11 C20 19 32 19 38 11' : 'M14 10 C20 22 32 22 38 10'}
            stroke="#be7c70"
            strokeLinecap="round"
            strokeWidth="5.5"
          />
        </motion.svg>

        <motion.div
          className="absolute bottom-[20px] left-1/2 z-40 flex h-[128px] w-[128px] -translate-x-1/2 items-center justify-center rounded-full"
          animate={{
            scale: isAnalyzing ? [1, 1.1, 1] : isListening ? [1, 1.05, 1] : 1,
            boxShadow: [
              `0 0 32px ${coreGlow}, 0 0 76px ${coreGlow}, inset 0 0 24px rgba(255,255,255,0.75)`,
              `0 0 44px ${coreGlow}, 0 0 96px ${coreGlow}, inset 0 0 28px rgba(255,255,255,0.85)`,
              `0 0 32px ${coreGlow}, 0 0 76px ${coreGlow}, inset 0 0 24px rgba(255,255,255,0.75)`,
            ],
          }}
          transition={{ duration: isAnalyzing ? 1.3 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: coreSurface }}
        >
          <div className="absolute inset-[9px] rounded-full border border-white/55 bg-white/10" />
          <div className="absolute left-[31px] top-[31px] h-3 w-3 rounded-full bg-white/80 blur-[1px]" />
          <div className="absolute bottom-[27px] right-[27px] h-2 w-2 rounded-full bg-white/75 blur-[1px]" />
          <SoundWave state={state} className="relative z-10" />
        </motion.div>

        <motion.div
          className="absolute bottom-[46px] left-[105px] z-50 h-[76px] w-[84px] rounded-full"
          animate={handPulse}
          style={{
            ...cloudBubbleStyle,
            background:
              'radial-gradient(circle at 34% 22%, rgba(255,255,255,1) 0%, rgba(251,253,255,0.95) 42%, rgba(219,233,255,0.78) 100%)',
            boxShadow:
              'inset 0 14px 22px rgba(255,255,255,0.92), inset 0 -16px 28px rgba(134,182,255,0.18), 0 12px 22px rgba(112,153,221,0.12)',
          }}
        >
          <div className="absolute right-[-8px] top-[28px] h-[54px] w-[45px] rounded-full bg-white/82" />
        </motion.div>
        <motion.div
          className="absolute bottom-[46px] right-[105px] z-50 h-[76px] w-[84px] rounded-full"
          animate={handPulse}
          style={{
            ...cloudBubbleStyle,
            background:
              'radial-gradient(circle at 34% 22%, rgba(255,255,255,1) 0%, rgba(251,253,255,0.95) 42%, rgba(219,233,255,0.78) 100%)',
            boxShadow:
              'inset 0 14px 22px rgba(255,255,255,0.92), inset 0 -16px 28px rgba(134,182,255,0.18), 0 12px 22px rgba(112,153,221,0.12)',
          }}
        >
          <div className="absolute left-[-8px] top-[28px] h-[54px] w-[45px] rounded-full bg-white/82" />
        </motion.div>

        <div className="absolute left-[86px] top-[70px] h-2 w-2 rounded-full bg-white/90 blur-[1px]" />
        <div className="absolute right-[118px] top-[56px] h-3 w-3 rounded-full bg-white/70 blur-[2px]" />
        <div className="absolute bottom-[98px] left-[56px] h-2.5 w-2.5 rounded-full bg-white/85 blur-[1px]" />
        <div className="absolute bottom-[92px] right-[64px] h-3 w-3 rounded-full bg-white/80 blur-[1px]" />
      </motion.div>

      <motion.div
        className="pointer-events-none absolute bottom-[18px] h-[28px] w-[305px] rounded-[100%] bg-blue-300/26 blur-xl"
        animate={{
          scale: isListening ? [1, 1.18, 1] : [1, 1.08, 1],
          opacity: isAnalyzing ? [0.38, 0.2, 0.38] : [0.28, 0.16, 0.28],
        }}
        transition={{ duration: isListening ? 2 : 4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
