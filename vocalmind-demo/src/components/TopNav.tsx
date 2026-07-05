import { Activity, Settings, User } from 'lucide-react';
import { AppMode, InteractionState } from '../types';
import { GlassCard } from './GlassCard';

interface TopNavProps {
  mode: AppMode;
  state: InteractionState;
  onHome: () => void;
}

export function TopNav({ mode, state, onHome }: TopNavProps) {
  return (
    <div className="w-full px-8 py-5 flex items-center justify-between absolute top-0 left-0 z-50">
      <button 
        onClick={onHome}
        className="flex items-center gap-3 group transition-opacity hover:opacity-80"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-blue-400 flex items-center justify-center shadow-md">
          <Activity className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
        </div>
        <span className="font-semibold text-xl tracking-tight text-[#1a2b4c]">VocalMind</span>
      </button>

      <div className="flex items-center gap-5">
        <GlassCard className="px-5 py-2 flex items-center gap-3 rounded-full border-white/80 bg-white/60">
          <div className={`w-2.5 h-2.5 rounded-full ${state === 'idle' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : (state === 'analyzing' ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)] animate-pulse' : 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse')}`} />
          <span className="text-[14px] font-medium text-slate-700 capitalize tracking-wide">
            {state === 'idle' ? 'ready' : (state === 'analyzing' ? '识别中' : state)}
          </span>
        </GlassCard>

        <button className="w-11 h-11 rounded-full flex items-center justify-center bg-white/70 hover:bg-white/90 backdrop-blur-md border border-white/80 transition-colors shadow-sm text-slate-600">
          <User className="w-5 h-5" />
        </button>
        <button className="w-11 h-11 rounded-full flex items-center justify-center bg-white/70 hover:bg-white/90 backdrop-blur-md border border-white/80 transition-colors shadow-sm text-slate-600">
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
