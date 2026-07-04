import { motion } from 'motion/react';
import { ArrowLeft, ChevronRight, Activity, Calendar } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { mockHistory, formatDuration, getEmotionColor, getEmotionLabel } from '../data/mockData';
import { HistoryRecord } from '../types';

interface HistoryViewProps {
  onBack: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
}

export function HistoryView({ onBack, onSelectRecord }: HistoryViewProps) {
  
  // Format date helper
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="flex flex-col items-center justify-start w-full h-full relative pt-6 pb-20 px-6 max-w-2xl mx-auto overflow-y-auto">
      
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-8 z-20">
        <button 
          onClick={onBack}
          className="p-3 rounded-full hover:bg-slate-100 transition-colors text-slate-500"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full flex flex-col items-center text-center mb-10 z-20">
        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[28px] md:text-[32px] font-semibold tracking-tight text-[#1a2b4c] mb-3"
        >
          历史情绪记录
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-[15px] text-slate-500 max-w-sm"
        >
          查看你最近几次对话中的情绪变化与状态总结
        </motion.p>
      </div>

      {/* Emotion Curve Chart (High Fidelity Mock) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full mb-10 z-20"
      >
        <GlassCard className="p-6 md:p-8 bg-white/70 w-full relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-medium text-slate-700 text-[16px] flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              近期情绪波动
            </h3>
            <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">最近 7 天</span>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Chart Area */}
            <div className="flex-1 relative h-[140px] flex items-end justify-between px-2">
               {/* Background Grid Lines */}
               <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-30">
                 <div className="w-full border-t border-slate-200 border-dashed h-0" />
                 <div className="w-full border-t border-slate-200 border-dashed h-0" />
                 <div className="w-full border-t border-slate-200 border-dashed h-0" />
               </div>
               
               {/* Simplified Smooth Curve using SVG */}
               <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path 
                    d="M 0,50 C 20,40 40,70 50,70 C 70,70 80,30 100,40 L 100,100 L 0,100 Z" 
                    fill="url(#gradient)" 
                    opacity="0.3"
                  />
                  <path 
                    d="M 0,50 C 20,40 40,70 50,70 C 70,70 80,30 100,40" 
                    fill="none" 
                    stroke="#60a5fa" 
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#eff6ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Data Points */}
                  <circle cx="0" cy="50" r="4" fill="#3b82f6" />
                  <circle cx="50" cy="70" r="4" fill="#f97316" className="opacity-80" />
                  <circle cx="100" cy="40" r="4" fill="#3b82f6" />
               </svg>

               {/* X Axis Labels */}
               <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>7月2日</span>
                  <span>7月3日</span>
                  <span>7月4日</span>
               </div>
            </div>

            {/* Summary Mini Card */}
            <div className="w-full md:w-[160px] flex flex-col gap-3 justify-center shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
               <div>
                 <p className="text-[11px] text-slate-400 mb-1">主要状态</p>
                 <p className="text-[14px] font-medium text-slate-700">平静偏疲惫</p>
               </div>
               <div>
                 <p className="text-[11px] text-slate-400 mb-1">波动程度</p>
                 <p className="text-[14px] font-medium text-slate-700">轻度</p>
               </div>
               <div>
                 <p className="text-[11px] text-slate-400 mb-1">平均状态</p>
                 <p className="text-[14px] font-medium text-slate-700 text-blue-600">稳定</p>
               </div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Session List */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full z-20 flex flex-col gap-3"
      >
        <h3 className="font-medium text-slate-700 text-[15px] mb-2 px-2 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          最近记录
        </h3>
        
        {mockHistory.map((record, index) => {
          const finalEmotion = record.feedback?.final_emotion || record.result.predicted_emotion;
          
          return (
            <motion.div 
              key={record.session.session_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
            >
              <GlassCard 
                onClick={() => onSelectRecord(record)}
                className="p-4 md:p-5 flex items-center bg-white/60 hover:bg-white/80 transition-all cursor-pointer group border-transparent hover:border-blue-100/50"
              >
                <div className="w-[80px] shrink-0 text-[15px] font-medium text-slate-700">
                  {formatDate(record.session.start_time)}
                </div>
                
                <div className="flex-1 text-[13px] text-slate-500">
                  {formatDuration(record.session.duration_seconds)}
                </div>
                
                <div className={`px-3 py-1.5 rounded-full text-[13px] font-medium border mr-3 ${getEmotionColor(finalEmotion)}`}>
                  {getEmotionLabel(finalEmotion)}
                </div>
                
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-colors" />
              </GlassCard>
            </motion.div>
          );
        })}
      </motion.div>
      
    </div>
  );
}
