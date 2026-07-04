import { motion, AnimatePresence } from 'motion/react';
import { Camera, Mic, PhoneOff, ScanFace, Activity, Hexagon, Cloud, Smile } from 'lucide-react';
import { AppMode, InteractionState, EmotionState } from '../types';
import { Avatar } from '../components/Avatar';
import { GlassCard } from '../components/GlassCard';
import { useCompanionBackend } from '../hooks/useCompanionBackend';

interface InteractionViewProps {
  mode: AppMode;
  state: InteractionState;
  emotion: EmotionState;
  onEnd: () => void;
  onStateChange: (state: InteractionState, emotion: EmotionState) => void;
}

export function InteractionView({ mode, state, emotion, onEnd, onStateChange }: InteractionViewProps) {
  const { setVideoRef, mediaError } = useCompanionBackend(true, mode === 'video' ? 'video' : 'audio', (em, st) => onStateChange(st, em));

  
  const getTitles = () => {
    switch(state) {
      case 'idle':
        return { title: '今天想和我聊聊吗？', subtitle: '我会根据你的语言、表情和语气，帮你理解当前情绪状态。' };
      case 'listening':
        return { title: '我在认真听你说。', subtitle: '继续说下去，我会捕捉你的语气、表情与节奏变化。' };
      case 'analyzing':
        return { title: '我正在理解你的情绪状态。', subtitle: '正在结合表情、声音和语气进行分析。' };
      case 'feedback':
      case 'comfort':
        if (emotion === 'calm') return { title: '我感受到你现在比较平静。', subtitle: '你的情绪状态稳定，也带着一点轻松和放松感。' };
        if (emotion === 'anxious') return { title: '没关系，深呼吸，我会陪着你。', subtitle: '我感到你有一点焦虑，允许自己慢下来。' };
        if (emotion === 'tired') return { title: '辛苦了，今天你做得很棒。', subtitle: '我察觉到一点疲惫，是时候好好休息一下了。' };
        return { title: '我在这里。', subtitle: '随时倾听你的声音。' };
      default:
        return { title: '', subtitle: '' };
    }
  };

  const { title, subtitle } = getTitles();

  return (
    <div className="flex flex-col items-center justify-center w-full h-full relative">
      
      {/* Dynamic Titles */}
      <div className="absolute top-8 left-0 right-0 flex flex-col items-center z-20">
        <AnimatePresence mode="wait">
          <motion.h1 
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-[32px] md:text-[36px] font-semibold tracking-tight text-[#1a2b4c] mb-3 text-center"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.p 
            key={subtitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[16px] text-slate-500 text-center max-w-lg"
          >
            {subtitle}
          </motion.p>
        </AnimatePresence>
        
        {/* Progress dots for analyzing state */}
        {state === 'analyzing' && (
          <div className="flex gap-2 mt-5">
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div 
                key={i}
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3], backgroundColor: ['#93c5fd', '#6366f1', '#93c5fd'] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-blue-300"
              />
            ))}
          </div>
        )}
      </div>

      {/* Main Interaction Stage */}
      <div className="flex-1 flex items-center justify-center relative w-full mt-16 mb-20">
        
        {/* Contextual Tags */}
        <AnimatePresence>
          {state !== 'idle' && (
            <>
              <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute top-[20%] left-[25%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-sm flex items-center gap-2 z-0 hidden lg:flex"
              >
                <Cloud className="w-4 h-4 text-blue-400" /> calm
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute top-[30%] right-[25%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-sm flex items-center gap-2 z-0 hidden lg:flex"
              >
                <Smile className="w-4 h-4 text-indigo-400" /> empathetic
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Central Avatar */}
        <Avatar state={state} emotion={emotion} />

        {/* Floating UI based on state */}
        <AnimatePresence>
          {state === 'idle' && (
             <motion.div
               initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
               className="absolute left-[10%] top-1/2 -translate-y-1/2 z-20 hidden lg:block"
             >
               <GlassCard className="p-5 w-[280px] bg-white/70">
                 <div className="flex items-center gap-3 mb-3">
                   <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                     <Activity className="w-4 h-4" />
                   </div>
                   <h4 className="text-[15px] font-medium text-slate-800">我在这里，随时倾听你</h4>
                 </div>
                 <p className="text-[13px] text-slate-500 leading-relaxed pl-11">
                   视频或语音对话均可，找一个舒适的环境，深呼吸，我们开始吧。
                 </p>
               </GlassCard>
             </motion.div>
          )}

          {state === 'listening' && (
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="absolute left-[12%] top-1/2 -translate-y-1/2 z-20 hidden lg:block"
            >
              <GlassCard className="p-5 w-[260px] flex flex-col gap-3 bg-white/80">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-medium text-slate-800">Listening...</h4>
                    <p className="text-[13px] text-slate-500">语音输入中</p>
                  </div>
                </div>
                <div className="flex gap-1.5 h-2.5 mt-2 items-end justify-center w-full px-2">
                   {Array.from({ length: 18 }).map((_, i) => (
                     <motion.div 
                       key={i} 
                       animate={{ height: ['20%', `${Math.random() * 80 + 20}%`, '20%'] }}
                       transition={{ duration: 0.3 + Math.random() * 0.5, repeat: Infinity }}
                       className="flex-1 bg-blue-400 rounded-full"
                     />
                   ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {state === 'analyzing' && (
            <>
              <motion.div
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="absolute left-[15%] top-[30%] z-20 hidden lg:block"
              >
                <GlassCard className="p-5 w-[240px] flex items-start gap-4 bg-white/80">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 border border-indigo-100 shrink-0">
                    <ScanFace className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-medium text-slate-800 mb-1">表情识别中</h4>
                    <p className="text-[12px] text-slate-500 leading-tight">捕捉面部微表情<br/>识别情绪信号</p>
                    <div className="flex gap-1 mt-3">
                      {[0,1,2,3].map(i => <motion.div key={i} animate={{opacity:[0.3,1,0.3]}} transition={{duration:1, delay:i*0.2, repeat:Infinity}} className="w-1.5 h-1.5 rounded-full bg-indigo-300" />)}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="absolute right-[15%] top-[25%] z-20 hidden lg:block"
              >
                <GlassCard className="p-5 w-[240px] flex items-start gap-4 bg-white/80">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 border border-blue-100 shrink-0">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-medium text-slate-800 mb-1">语气分析中</h4>
                    <p className="text-[12px] text-slate-500 leading-tight">分析声音的语调<br/>节奏与强度变化</p>
                    <div className="flex gap-1 mt-3">
                      {[0,1,2,3].map(i => <motion.div key={i} animate={{opacity:[0.3,1,0.3]}} transition={{duration:1, delay:i*0.2, repeat:Infinity}} className="w-1.5 h-1.5 rounded-full bg-blue-300" />)}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="absolute right-[20%] bottom-[20%] z-20 hidden lg:block"
              >
                <GlassCard className="p-5 w-[240px] flex items-start gap-4 bg-white/80">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 border border-orange-100 shrink-0">
                    <Hexagon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-medium text-slate-800 mb-1">情绪线索整合中</h4>
                    <p className="text-[12px] text-slate-500 leading-tight">多维度信息融合<br/>构建情绪模型</p>
                    <div className="flex gap-1 mt-3">
                      {[0,1,2,3].map(i => <motion.div key={i} animate={{opacity:[0.3,1,0.3]}} transition={{duration:1, delay:i*0.2, repeat:Infinity}} className="w-1.5 h-1.5 rounded-full bg-orange-300" />)}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </>
          )}

          {(state === 'feedback' || state === 'comfort') && (
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="absolute left-[15%] top-1/2 -translate-y-1/2 z-20 hidden lg:block"
            >
              <GlassCard className="p-6 w-[280px] bg-white/80">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="w-5 h-5 text-blue-500" />
                  <span className="text-[15px] font-medium text-slate-700">当前状态：</span>
                  <span className="text-[20px] font-semibold text-blue-600 ml-auto tracking-wide">
                    {emotion === 'calm' ? '平静' : emotion === 'anxious' ? '焦虑' : emotion === 'tired' ? '疲惫' : '正常'}
                  </span>
                </div>
                <div className="text-[13px] text-slate-500 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                  情绪关键词：
                  {emotion === 'calm' && <span className="text-blue-500 font-medium ml-1">放松、专注、轻松</span>}
                  {emotion === 'anxious' && <span className="text-orange-500 font-medium ml-1">紧绷、心率稍快、不安</span>}
                  {emotion === 'tired' && <span className="text-slate-400 font-medium ml-1">低能量、语速慢、疲劳</span>}
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Camera Window (if in video mode) */}
        {mode === 'video' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute bottom-28 right-4 md:bottom-6 md:right-10 w-[150px] h-[210px] md:w-[220px] md:h-[300px] bg-slate-900 rounded-[24px] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.2)] border-2 border-white/10 z-40 block group"
          >
             {/* Actual video feed */}
             <div className="w-full h-full relative bg-slate-800 flex items-center justify-center">
                <video ref={setVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {mediaError && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-900 px-5 text-center">
                    <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white">
                      <Camera className="w-5 h-5" />
                    </div>
                    <p className="text-[13px] leading-relaxed text-white/85">
                      {mediaError}
                    </p>
                  </div>
                )}
                
                {/* Overlay indicating analysis is active on camera */}
                <AnimatePresence>
                  {state === 'analyzing' && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 border-2 border-indigo-400/50 rounded-[22px] flex items-center justify-center overflow-hidden"
                    >
                      <motion.div 
                        animate={{ y: ['-150%', '150%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-[2px] bg-indigo-400/80 shadow-[0_0_15px_rgba(99,102,241,1)]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>
             
             {/* Hover Controls for Camera */}
             <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white cursor-pointer hover:bg-black/60">
                   <ScanFace className="w-4 h-4" />
                </div>
             </div>

             <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center px-3 py-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                <span className="text-[11px] text-white/90 font-medium tracking-wide">You</span>
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                </div>
             </div>
          </motion.div>
        )}
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30">
        <GlassCard className="px-8 py-4 flex items-center gap-8 rounded-[2rem] bg-white/70 shadow-[0_15px_35px_rgba(0,0,0,0.05)] border border-white">
           <button 
             className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 shadow-sm"
             title={mode === 'video' ? '关闭摄像头' : '开启摄像头'}
           >
             <Camera className="w-5 h-5" />
           </button>
           <div className="relative">
             <button 
               className="w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-tr from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500 transition-colors text-white shadow-[0_8px_20px_rgba(59,130,246,0.3)] border border-blue-400/50"
             >
               <Mic className="w-7 h-7" />
             </button>
             {state === 'listening' && (
               <motion.div 
                 animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                 transition={{ duration: 1.5, repeat: Infinity }}
                 className="absolute inset-0 rounded-full border-2 border-blue-400 pointer-events-none"
               />
             )}
           </div>
           <button 
             onClick={onEnd}
             className="w-12 h-12 rounded-full flex items-center justify-center bg-rose-50 hover:bg-rose-100 transition-colors text-rose-500 shadow-sm border border-rose-100"
             title="结束对话"
           >
             <PhoneOff className="w-5 h-5" />
           </button>
        </GlassCard>
      </div>

    </div>
  );
}
