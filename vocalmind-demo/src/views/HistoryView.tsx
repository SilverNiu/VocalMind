import { motion } from 'motion/react';
import { ArrowLeft, ChevronRight, Activity, Calendar } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { formatDuration, getEmotionColor, getEmotionLabel } from '../lib/emotionDisplay';
import { HistoryRecord } from '../types';

interface HistoryViewProps {
  onBack: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
  records: HistoryRecord[];
}

export function HistoryView({ onBack, onSelectRecord, records }: HistoryViewProps) {
  const recentRecords = records.slice(0, 7);
  const chartPoints = buildChartPoints(recentRecords);
  const curvePath = buildCurvePath(chartPoints);
  const areaPath = `${curvePath} L 100,100 L 0,100 Z`;
  const primaryEmotion = recentRecords[0]?.feedback?.final_emotion || recentRecords[0]?.result.predicted_emotion || null;
  const averageDuration = recentRecords.length
    ? Math.round(recentRecords.reduce((sum, record) => sum + record.session.duration_seconds, 0) / recentRecords.length)
    : 0;
  
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

      {/* Emotion Curve Chart */}
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
            <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">本地记录</span>
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
               
               <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path d={areaPath} fill="url(#gradient)" opacity="0.3" />
                  <path
                    d={curvePath}
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
                  
                  {chartPoints.map((point, index) => (
                    <circle key={index} cx={point.x} cy={point.y} r="4" fill={point.color} />
                  ))}
               </svg>

               <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-[11px] text-slate-400 font-medium">
                  {chartPoints.length ? (
                    chartPoints.map((point, index) => <span key={index}>{point.label}</span>)
                  ) : (
                    <span>暂无记录</span>
                  )}
               </div>
            </div>

            {/* Summary Mini Card */}
            <div className="w-full md:w-[160px] flex flex-col gap-3 justify-center shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
               <div>
                 <p className="text-[11px] text-slate-400 mb-1">主要状态</p>
                 <p className="text-[14px] font-medium text-slate-700">{getEmotionLabel(primaryEmotion)}</p>
               </div>
               <div>
                 <p className="text-[11px] text-slate-400 mb-1">记录数量</p>
                 <p className="text-[14px] font-medium text-slate-700">{records.length} 次</p>
               </div>
               <div>
                 <p className="text-[11px] text-slate-400 mb-1">平均时长</p>
                 <p className="text-[14px] font-medium text-slate-700 text-blue-600">{formatDuration(averageDuration)}</p>
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
        
        {records.length === 0 && (
          <GlassCard className="p-6 bg-white/60 text-center">
            <p className="text-[14px] text-slate-500">暂无本地对话记录。完成一次语音或视频对话后，记录会显示在这里。</p>
          </GlassCard>
        )}

        {records.map((record, index) => {
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

function buildChartPoints(records: HistoryRecord[]) {
  const ordered = [...records].reverse();
  if (!ordered.length) {
    return [
      { x: 0, y: 68, label: '', color: '#cbd5e1' },
      { x: 100, y: 68, label: '', color: '#cbd5e1' },
    ];
  }
  if (ordered.length === 1) {
    const record = ordered[0];
    return [
      {
        x: 50,
        y: emotionToY(record.feedback?.final_emotion || record.result.predicted_emotion),
        label: formatShortDate(record.session.start_time),
        color: emotionToColor(record.feedback?.final_emotion || record.result.predicted_emotion),
      },
    ];
  }
  return ordered.map((record, index) => {
    const emotion = record.feedback?.final_emotion || record.result.predicted_emotion;
    return {
      x: Math.round((index / Math.max(1, ordered.length - 1)) * 100),
      y: emotionToY(emotion),
      label: formatShortDate(record.session.start_time),
      color: emotionToColor(emotion),
    };
  });
}

function buildCurvePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 1) {
    const point = points[0];
    return `M 0,${point.y} L 100,${point.y}`;
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
}

function emotionToY(emotion: string | null) {
  switch (emotion) {
    case 'happy':
    case 'relaxed':
      return 32;
    case 'calm':
    case 'focused':
    case 'neutral':
      return 48;
    case 'tired':
      return 64;
    case 'anxious':
      return 76;
    default:
      return 68;
  }
}

function emotionToColor(emotion: string | null) {
  switch (emotion) {
    case 'anxious':
      return '#f97316';
    case 'happy':
    case 'relaxed':
      return '#10b981';
    case 'focused':
      return '#6366f1';
    default:
      return '#3b82f6';
  }
}

function formatShortDate(isoString: string) {
  const date = new Date(isoString);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
