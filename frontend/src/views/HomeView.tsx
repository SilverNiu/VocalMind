import { motion } from 'motion/react';
import { Camera, Mic, FileText, ShieldCheck, Heart, Cloud, Wind, Smile, Play, Radio } from 'lucide-react';
import { AppMode, InteractionState } from '../types';
import { Avatar } from '../components/Avatar';
import { GlassCard } from '../components/GlassCard';
import { cn } from '../lib/utils';

interface HomeViewProps {
  state: InteractionState;
  onStart: (mode: AppMode) => void;
}

export function HomeView({ state, onStart }: HomeViewProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full relative mt-16">
      
      {/* Background Floating Tags */}
      <motion.div 
        animate={{ y: [-8, 8, -8] }} 
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[15%] left-[25%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-[0_4px_15px_rgba(0,0,0,0.02)] flex items-center gap-2 z-0"
      >
        <Cloud className="w-4 h-4 text-blue-400" /> calm
      </motion.div>

      <motion.div 
        animate={{ y: [8, -8, 8] }} 
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute bottom-[35%] right-[22%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-[0_4px_15px_rgba(0,0,0,0.02)] flex items-center gap-2 z-0"
      >
        <Smile className="w-4 h-4 text-amber-400" /> with you
      </motion.div>
      
      <motion.div 
        animate={{ y: [-5, 5, -5] }} 
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute top-[25%] right-[28%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-[0_4px_15px_rgba(0,0,0,0.02)] flex items-center gap-2 z-0"
      >
        <ShieldCheck className="w-4 h-4 text-emerald-400" /> safe
      </motion.div>

      <motion.div 
        animate={{ y: [5, -5, 5] }} 
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="absolute top-[45%] left-[22%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-[0_4px_15px_rgba(0,0,0,0.02)] flex items-center gap-2 z-0"
      >
        <Heart className="w-4 h-4 text-rose-400" /> gentle
      </motion.div>

      {/* Main Avatar Area */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 w-full mb-8 relative">
        <h1 className="text-[40px] leading-tight md:text-[46px] font-semibold tracking-tight text-[#1a2b4c] mb-4 text-center">
          没关系，我会陪着你。
        </h1>
        <p className="text-[17px] text-slate-500 mb-10 text-center max-w-md">
          如果你愿意，我们可以继续聊一会儿。
        </p>

        <div className="relative flex justify-center items-center w-full max-w-4xl">
          
          {/* Left Contextual Card */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20 hidden lg:block">
            <GlassCard className="p-6 w-[260px] bg-white/60">
              <h3 className="text-[15px] font-medium text-slate-700 flex items-center gap-2 mb-5">
                <Heart className="w-4 h-4 text-orange-400" /> 要不要试试这样？
              </h3>
              <ul className="space-y-4 text-[14px] text-slate-500">
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Wind className="w-3.5 h-3.5" /></div>
                  深呼吸一下
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500"><Mic className="w-3.5 h-3.5" /></div>
                  继续聊聊现在的感受
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500"><Play className="w-3.5 h-3.5" /></div>
                  我在听
                </li>
              </ul>
            </GlassCard>
          </div>

          <Avatar state={state} emotion={null} />
          
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex flex-wrap items-center justify-center gap-5 z-20 mb-10">
        <button 
          onClick={() => onStart('video')}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-[#5b8cff] hover:from-blue-600 hover:to-blue-500 text-white shadow-[0_12px_24px_rgba(91,140,255,0.25)] transition-all hover:-translate-y-0.5 group border border-blue-400/50"
        >
          <Camera className="w-5 h-5" />
          <span className="font-medium text-[17px]">开始视频对话</span>
          <span className="ml-1 opacity-80 group-hover:translate-x-1 transition-transform">›</span>
        </button>

        <button 
          onClick={() => onStart('audio')}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white text-slate-700 shadow-[0_8px_20px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 group"
        >
          <Mic className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-[17px]">开始语音对话</span>
          <span className="ml-1 opacity-50 group-hover:translate-x-1 transition-transform">›</span>
        </button>

        <button
          onClick={() => onStart('minicpm')}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-xl border border-blue-100 text-slate-700 shadow-[0_8px_20px_rgba(37,99,235,0.08)] transition-all hover:-translate-y-0.5 group"
        >
          <Radio className="w-5 h-5 text-cyan-500" />
          <span className="font-medium text-[17px]">MiniCPM 实时语音</span>
          <span className="ml-1 opacity-50 group-hover:translate-x-1 transition-transform">›</span>
        </button>

        <button 
          onClick={() => onStart('history')}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-50/80 to-amber-50/80 hover:from-orange-100 hover:to-amber-100 backdrop-blur-xl border border-orange-100 text-[#a06030] shadow-[0_8px_20px_rgba(255,150,100,0.06)] transition-all hover:-translate-y-0.5 group"
        >
          <FileText className="w-5 h-5 text-orange-400" />
          <span className="font-medium text-[17px]">查看历史记录</span>
          <span className="ml-1 opacity-50 group-hover:translate-x-1 transition-transform">›</span>
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-[13px] text-slate-400 pb-6">
        <ShieldCheck className="w-4 h-4" />
        你的隐私对我们很重要。所有对话内容均安全加密，仅用于情绪分析与陪伴。
      </div>
    </div>
  );
}
