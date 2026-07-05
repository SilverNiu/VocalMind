import { motion } from 'motion/react';
import { Camera, Mic, FileText, ShieldCheck, Heart, Cloud, Smile } from 'lucide-react';
import { AppMode, InteractionState } from '../types';
import { Avatar } from '../components/Avatar';

interface HomeViewProps {
  state: InteractionState;
  onStart: (mode: AppMode) => void;
}

export function HomeView({ state, onStart }: HomeViewProps) {
  return (
    <div className="relative mt-16 flex h-full w-full flex-col items-center justify-center">
      <motion.div
        animate={{ y: [-8, 8, -8] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-[17%] top-[12%] z-0 flex items-center gap-2 rounded-full border border-white/80 bg-white/50 px-4 py-2 text-sm text-slate-500 shadow-[0_4px_15px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <Cloud className="h-4 w-4 text-blue-400" /> calm
      </motion.div>

      <motion.div
        animate={{ y: [8, -8, 8] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute bottom-[35%] right-[22%] z-0 flex items-center gap-2 rounded-full border border-white/80 bg-white/50 px-4 py-2 text-sm text-slate-500 shadow-[0_4px_15px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <Smile className="h-4 w-4 text-amber-400" /> with you
      </motion.div>

      <motion.div
        animate={{ y: [-5, 5, -5] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute right-[28%] top-[25%] z-0 flex items-center gap-2 rounded-full border border-white/80 bg-white/50 px-4 py-2 text-sm text-slate-500 shadow-[0_4px_15px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <ShieldCheck className="h-4 w-4 text-emerald-400" /> safe
      </motion.div>

      <motion.div
        animate={{ y: [5, -5, 5] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="absolute left-[22%] top-[45%] z-0 flex items-center gap-2 rounded-full border border-white/80 bg-white/50 px-4 py-2 text-sm text-slate-500 shadow-[0_4px_15px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <Heart className="h-4 w-4 text-rose-400" /> gentle
      </motion.div>

      <div className="relative z-10 mb-8 flex w-full flex-1 flex-col items-center justify-center">
        <h1
          className="mb-5 text-center text-[34px] font-medium leading-tight tracking-normal text-[#4f607a] md:text-[42px]"
          style={{ fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif' }}
        >
          没关系，我会陪着你。
        </h1>
        <p
          className="mb-10 max-w-md text-center text-[17px] font-normal text-[#7f8ca2] md:text-[18px]"
          style={{ fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif' }}
        >
          选择语音或视频，和 MiniCPM 继续聊一会儿。
        </p>

        <div className="relative flex w-full max-w-4xl items-center justify-center">
          <div data-testid="home-avatar-hover-target" className="group/avatar relative z-10">
            <div className="pointer-events-none absolute left-[-245px] top-1/2 z-30 hidden w-[300px] -translate-y-1/2 translate-x-4 scale-[0.97] opacity-0 transition-all duration-300 ease-out group-hover/avatar:translate-x-0 group-hover/avatar:scale-100 group-hover/avatar:opacity-100 lg:block">
              <div className="relative w-[300px] rounded-[34px] rounded-br-[42px] border border-white/80 bg-white/78 px-6 py-5 text-[#59677d] shadow-[0_18px_45px_rgba(111,139,177,0.14)] backdrop-blur-xl">
                <div className="absolute right-[-9px] top-1/2 h-7 w-7 -translate-y-1/2 rotate-45 rounded-[8px] border-r border-t border-white/80 bg-white/78" />
                <div className="relative">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50/80 px-3 py-1.5 text-[13px] text-[#9a7042]">
                    <Heart className="h-3.5 w-3.5 text-orange-400" />
                    我会轻轻听你说
                  </div>
                  <p className="text-[14px] leading-7">
                    语音会采样声音情绪；视频会同时采样声音和表情信号。
                  </p>
                  <p className="mt-2 text-[14px] leading-7 text-[#6f7b91]">
                    当前底层对话统一由 MiniCPM 实时模型完成。
                  </p>
                </div>
              </div>
            </div>
            <Avatar state={state} emotion={null} />
          </div>
        </div>
      </div>

      <div className="z-20 mb-10 w-full max-w-4xl px-5">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            data-testid="start-video-chat"
            onClick={() => onStart('video')}
            className="group flex h-14 items-center gap-3 rounded-2xl border border-blue-400/50 bg-gradient-to-r from-blue-500 to-[#5b8cff] px-6 text-white shadow-[0_12px_24px_rgba(91,140,255,0.22)] transition-all hover:-translate-y-0.5 hover:from-blue-600 hover:to-blue-500"
          >
            <Camera className="h-5 w-5" />
            <span className="text-[16px] font-medium">视频对话</span>
            <span className="ml-1 opacity-80 transition-transform group-hover:translate-x-1">→</span>
          </button>

          <button
            data-testid="start-audio-chat"
            onClick={() => onStart('audio')}
            className="group flex h-14 items-center gap-3 rounded-2xl border border-blue-100 bg-white/78 px-6 text-[#33415f] shadow-[0_8px_20px_rgba(37,99,235,0.08)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/95"
          >
            <Mic className="h-5 w-5 text-blue-500" />
            <span className="text-[16px] font-medium">语音对话</span>
            <span className="ml-1 opacity-50 transition-transform group-hover:translate-x-1">→</span>
          </button>

          <button
            onClick={() => onStart('history')}
            className="group flex h-14 items-center justify-center gap-3 rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50/80 to-amber-50/80 px-5 text-[#a06030] shadow-[0_8px_20px_rgba(255,150,100,0.06)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:from-orange-100 hover:to-amber-100"
          >
            <FileText className="h-5 w-5 text-orange-400" />
            <span className="whitespace-nowrap text-[15px] font-medium">历史记录</span>
            <span className="ml-1 opacity-50 transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pb-6 text-[13px] text-slate-400">
        <ShieldCheck className="h-4 w-4" />
        本地采样只在你的电脑上进行，模型推理仍由服务器完成。
      </div>
    </div>
  );
}
