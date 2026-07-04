import { motion } from 'motion/react';
import { Camera, Mic, FileText, ShieldCheck, Heart, Cloud, Wind, Smile } from 'lucide-react';
import { AppMode, InteractionState } from '../types';
import { Avatar } from '../components/Avatar';

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
        className="absolute top-[12%] left-[17%] px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/80 text-slate-500 text-sm shadow-[0_4px_15px_rgba(0,0,0,0.02)] flex items-center gap-2 z-0"
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
        <h1
          className="text-[34px] leading-tight md:text-[42px] font-medium tracking-normal text-[#4f607a] mb-5 text-center"
          style={{ fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif' }}
        >
          没关系，我会陪着你。
        </h1>
        <p
          className="text-[17px] md:text-[18px] text-[#7f8ca2] mb-10 text-center max-w-md font-normal"
          style={{ fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif' }}
        >
          如果你愿意，我们可以继续聊一会儿。
        </p>

        <div className="relative flex justify-center items-center w-full max-w-4xl">
          
          <div
            data-testid="home-avatar-hover-target"
            className="relative z-10 group/avatar"
          >
            <div className="pointer-events-none absolute left-[-245px] top-1/2 z-30 hidden w-[300px] -translate-y-1/2 translate-x-4 scale-[0.97] opacity-0 transition-all duration-300 ease-out group-hover/avatar:translate-x-0 group-hover/avatar:scale-100 group-hover/avatar:opacity-100 lg:block">
                <div className="relative w-[300px] rounded-[34px] rounded-br-[42px] bg-white/78 px-6 py-5 text-[#59677d] shadow-[0_18px_45px_rgba(111,139,177,0.14)] border border-white/80 backdrop-blur-xl">
                  <div className="absolute right-[-9px] top-1/2 h-7 w-7 -translate-y-1/2 rotate-45 rounded-[8px] bg-white/78 border-r border-t border-white/80" />
                  <div className="relative">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50/80 px-3 py-1.5 text-[13px] text-[#9a7042]">
                      <Heart className="h-3.5 w-3.5 text-orange-400" />
                      我会轻轻听你说
                    </div>
                    <p className="text-[14px] leading-7">
                      语音里，我会留意声音情绪；如果你打开视频，我也会看看表情里的细微信号。
                    </p>
                    <p className="mt-2 text-[14px] leading-7 text-[#6f7b91]">
                      聊着聊着，情绪线索会被悄悄整理下来，结束后给你一份温柔的记录。
                    </p>
                  </div>
                </div>
              </div>
            <Avatar state={state} emotion={null} />
          </div>
          
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="w-full max-w-4xl px-5 z-20 mb-10">
        <div className="flex flex-wrap items-center justify-center gap-4">
        <button 
          onClick={() => onStart('video')}
          className="h-14 flex items-center gap-3 px-6 rounded-2xl bg-gradient-to-r from-blue-500 to-[#5b8cff] hover:from-blue-600 hover:to-blue-500 text-white shadow-[0_12px_24px_rgba(91,140,255,0.22)] transition-all hover:-translate-y-0.5 group border border-blue-400/50"
        >
          <Camera className="w-5 h-5" />
          <span className="font-medium text-[16px]">视频通话</span>
          <span className="ml-1 opacity-80 group-hover:translate-x-1 transition-transform">›</span>
        </button>

        <button
          onClick={() => onStart('minicpm')}
          className="h-14 flex items-center gap-3 px-6 rounded-2xl bg-white/78 hover:bg-white/95 backdrop-blur-xl border border-blue-100 text-[#33415f] shadow-[0_8px_20px_rgba(37,99,235,0.08)] transition-all hover:-translate-y-0.5 group"
        >
          <Mic className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-[16px]">语音对话</span>
          <span className="ml-1 opacity-50 group-hover:translate-x-1 transition-transform">›</span>
        </button>

        <button 
          onClick={() => onStart('history')}
          className="h-14 flex items-center justify-center gap-3 px-5 rounded-2xl bg-gradient-to-r from-orange-50/80 to-amber-50/80 hover:from-orange-100 hover:to-amber-100 backdrop-blur-xl border border-orange-100 text-[#a06030] shadow-[0_8px_20px_rgba(255,150,100,0.06)] transition-all hover:-translate-y-0.5 group"
        >
          <FileText className="w-5 h-5 text-orange-400" />
          <span className="font-medium text-[15px] whitespace-nowrap">历史记录</span>
          <span className="ml-1 opacity-50 group-hover:translate-x-1 transition-transform">›</span>
        </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[13px] text-slate-400 pb-6">
        <ShieldCheck className="w-4 h-4" />
        你的隐私对我们很重要。所有对话内容均安全加密，仅用于情绪分析与陪伴。
      </div>
    </div>
  );
}
