import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Activity, Clock, BarChart2, MessageCircle, Info, Mic, ScanFace, Check, X, HelpCircle, Edit3 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { HistoryRecord, EmotionState } from '../types';
import { formatDuration, getEmotionColor, getEmotionLabel } from '../data/mockData';

interface ReportViewProps {
  record: HistoryRecord;
  onBack: () => void;
  onFeedbackSubmit?: (recordId: string, finalEmotion: EmotionState, supplement?: string) => void;
}

export function ReportView({ record, onBack, onFeedbackSubmit }: ReportViewProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionState>(null);
  const [supplementText, setSupplementText] = useState('');
  
  const hasFeedback = !!record.feedback;
  const displayEmotion = record.feedback?.final_emotion || record.result.predicted_emotion;

  const handleFeedbackSubmit = () => {
    if (onFeedbackSubmit && selectedEmotion) {
      onFeedbackSubmit(record.session.session_id, selectedEmotion, supplementText);
      setFeedbackOpen(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start w-full h-full relative pt-6 pb-24 px-6 max-w-2xl mx-auto overflow-y-auto">
      
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
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="text-[28px] md:text-[32px] font-semibold tracking-tight text-[#1a2b4c] mb-3"
        >
          本次对话总结
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-[14px] text-slate-500 max-w-md leading-relaxed"
        >
          以下内容基于本次交流过程中的语音与表情线索生成，仅供参考。
        </motion.p>
      </div>

      {/* Main Result Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="w-full mb-6 z-20"
      >
        <GlassCard className="p-6 md:p-8 bg-white/80 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 mb-6">
            <div className="flex flex-col items-center md:items-start gap-2">
              <span className="text-[13px] text-slate-400 font-medium tracking-wide uppercase">当前状态</span>
              <div className={`px-4 py-1.5 rounded-full text-[18px] font-medium border ${getEmotionColor(displayEmotion)}`}>
                {getEmotionLabel(displayEmotion)}
              </div>
            </div>
            
            <div className="flex gap-8 text-center md:text-right">
              <div>
                <p className="text-[12px] text-slate-400 mb-1 flex items-center justify-center md:justify-end gap-1">
                  <Clock className="w-3.5 h-3.5" /> 交流时长
                </p>
                <p className="text-[16px] font-medium text-slate-700">{formatDuration(record.session.duration_seconds)}</p>
              </div>
              <div>
                <p className="text-[12px] text-slate-400 mb-1 flex items-center justify-center md:justify-end gap-1">
                  <Activity className="w-3.5 h-3.5" /> 情绪波动
                </p>
                <p className="text-[16px] font-medium text-slate-700">轻度</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-100/50">
             <div className="flex items-center gap-2 mb-2 text-[13px] text-slate-500 font-medium">
               <Info className="w-4 h-4 text-blue-400" /> 主要关键词
             </div>
             <div className="flex flex-wrap gap-2">
               {record.report.emotion_keywords.map((kw, i) => (
                 <span key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-600 shadow-sm">
                   {kw}
                 </span>
               ))}
             </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Grid of Details */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 z-20">
        
        {/* Audio Clues */}
        {record.report.audio_summary && record.report.audio_summary.length > 0 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <GlassCard className="p-5 h-full bg-white/60 hover:bg-white/70 transition-colors">
              <h4 className="text-[14px] font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Mic className="w-4 h-4 text-blue-500" /> 语音线索
              </h4>
              <ul className="space-y-2">
                {record.report.audio_summary.map((item, i) => (
                  <li key={i} className="text-[13px] text-slate-500 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.div>
        )}

        {/* Face Clues */}
        {record.report.face_summary && record.report.face_summary.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
            <GlassCard className="p-5 h-full bg-white/60 hover:bg-white/70 transition-colors">
              <h4 className="text-[14px] font-medium text-slate-700 mb-3 flex items-center gap-2">
                <ScanFace className="w-4 h-4 text-indigo-500" /> 面部线索
              </h4>
              <ul className="space-y-2">
                {record.report.face_summary.map((item, i) => (
                  <li key={i} className="text-[13px] text-slate-500 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.div>
        )}
        
        {/* Fallback if no specific clues */}
        {(!record.report.audio_summary?.length && !record.report.face_summary?.length) && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="col-span-1 md:col-span-2">
             <GlassCard className="p-5 bg-white/60 text-center">
               <p className="text-[13px] text-slate-400">本次未采集到详细的语音或面部分析线索。</p>
             </GlassCard>
           </motion.div>
        )}
      </div>

      {/* Text Summary */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="w-full mb-10 z-20"
      >
        <GlassCard className="p-6 bg-blue-50/50 border border-blue-100/50">
          <h4 className="text-[14px] font-medium text-slate-700 mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-500" /> 综合建议
          </h4>
          <p className="text-[14px] text-slate-600 leading-relaxed">
            {record.report.overall_summary}
          </p>
        </GlassCard>
      </motion.div>

      {/* Feedback Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        className="w-full z-20"
      >
        {hasFeedback && !feedbackOpen ? (
          <div className="text-center px-4 py-3 bg-emerald-50 text-emerald-600 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 border border-emerald-100">
            <Check className="w-4 h-4" /> 感谢你的反馈，记录已更新
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <p className="text-[13px] text-slate-400 mb-4">本次结果准确吗？</p>
            <div className="flex flex-wrap justify-center gap-3 w-full">
              {!feedbackOpen ? (
                <>
                  <button 
                    onClick={() => {
                      if (onFeedbackSubmit) onFeedbackSubmit(record.session.session_id, record.result.predicted_emotion);
                    }}
                    className="px-5 py-2.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[13px] font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Check className="w-4 h-4 text-emerald-500" /> 准确
                  </button>
                  <button 
                    onClick={() => setFeedbackOpen(true)}
                    className="px-5 py-2.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[13px] font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <X className="w-4 h-4 text-orange-400" /> 不太准确
                  </button>
                  <button 
                    onClick={() => setFeedbackOpen(true)}
                    className="px-5 py-2.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[13px] font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Edit3 className="w-4 h-4 text-blue-400" /> 我想补充
                  </button>
                </>
              ) : (
                <GlassCard className="w-full p-5 bg-white/90">
                  <h5 className="text-[13px] font-medium text-slate-700 mb-3">你认为更符合的状态是：</h5>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {['calm', 'anxious', 'tired', 'happy', 'focused', 'relaxed'].map((em) => (
                      <button
                        key={em}
                        onClick={() => setSelectedEmotion(em as EmotionState)}
                        className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${
                          selectedEmotion === em 
                            ? 'bg-blue-500 text-white shadow-md' 
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {getEmotionLabel(em)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="其他补充（选填）"
                    value={supplementText}
                    onChange={(e) => setSupplementText(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all mb-4 resize-none h-20"
                  />
                  <div className="flex gap-3 justify-end">
                    <button 
                      onClick={() => setFeedbackOpen(false)}
                      className="px-4 py-2 rounded-xl text-[13px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      取消
                    </button>
                    <button 
                      onClick={handleFeedbackSubmit}
                      disabled={!selectedEmotion}
                      className="px-5 py-2 rounded-xl text-[13px] font-medium bg-blue-500 text-white shadow-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      提交反馈
                    </button>
                  </div>
                </GlassCard>
              )}
            </div>
          </div>
        )}
      </motion.div>

    </div>
  );
}
