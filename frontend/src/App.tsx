import { useState, useEffect } from 'react';
import { AppMode, InteractionState, EmotionState, HistoryRecord } from './types';
import { TopNav } from './components/TopNav';
import { HomeView } from './views/HomeView';
import { HistoryView } from './views/HistoryView';
import { ReportView } from './views/ReportView';
import { MiniCpmVoiceView } from './views/MiniCpmVoiceView';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { mockHistory } from './data/mockData';

function BackgroundDecorations({ state, emotion }: { state: InteractionState, emotion: EmotionState }) {
  const isComfort = state === 'comfort' || (state === 'feedback' && (emotion === 'anxious' || emotion === 'tired'));
  const isAnalyzing = state === 'analyzing';

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Base Gradient */}
      <motion.div 
        animate={{
          background: isComfort 
            ? 'linear-gradient(135deg, #fdfbfb 0%, #f4eae6 100%)' 
            : 'linear-gradient(135deg, #f8f9fa 0%, #e8f0f6 100%)'
        }}
        transition={{ duration: 3 }}
        className="absolute inset-0"
      />
      
      {/* Soft Focal Light Fields */}
      <motion.div 
        animate={{
          scale: isAnalyzing ? [1, 1.1, 1] : [1, 1.05, 1],
          opacity: isAnalyzing ? [0.5, 0.7, 0.5] : 0.4,
          x: ['-5%', '0%', '-5%'],
          y: ['-5%', '5%', '-5%']
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full blur-[120px]",
          isComfort ? "bg-orange-100/60" : "bg-blue-100/60"
        )}
      />
      
      <motion.div 
        animate={{
          scale: [1, 1.15, 1],
          opacity: 0.3,
          x: ['5%', '-5%', '5%'],
          y: ['5%', '-5%', '5%']
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className={cn(
          "absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[140px]",
          isComfort ? "bg-rose-100/50" : "bg-indigo-100/50"
        )}
      />

      {/* Cloud-like soft overlays */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-[50px] mix-blend-overlay" />

      {/* Fine Particles */}
      <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMDAiIGN5PSIxMDAiIHI9IjAuNSIgZmlsbD0icmdiYSgxMDAsIDE1MCwgMjU1LCAwLjQpIi8+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iMC41IiBmaWxsPSJyZ2JhKDEwMCwgMTUwLCAyNTUsIDAuNCkiLz48Y2lyY2xlIGN4PSIxNTAiIGN5PSI0MCIgcj0iMSIgZmlsbD0icmdiYSgxMDAsIDE1MCwgMjU1LCAwLjIpIi8+PC9zdmc+')] background-repeat" />
      
      {/* Subtle Soundwave Line */}
      <motion.div 
        animate={{ 
          opacity: (state === 'listening' || state === 'analyzing') ? 0.4 : 0.1,
          scaleY: state === 'listening' ? [1, 1.5, 1] : 1
        }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute top-1/2 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-200/50 to-transparent blur-[2px]" 
      />
    </div>
  );
}

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('home');
  const [interactionState, setInteractionState] = useState<InteractionState>('idle');
  const [emotion, setEmotion] = useState<EmotionState>(null);
  const [historyData, setHistoryData] = useState<HistoryRecord[]>(mockHistory);
  const [currentRecord, setCurrentRecord] = useState<HistoryRecord | null>(null);

  // Simulation logic removed in favor of real backend

  const handleStart = (mode: AppMode) => {
    setAppMode(mode);
    setInteractionState('idle');
    setEmotion(null);
  };

  const handleStateChange = (state: InteractionState, em: EmotionState) => {
    setInteractionState(state);
    if (em !== undefined && em !== null) {
      setEmotion(em);
    }
  };

  const handleHome = () => {
    setAppMode('home');
    setInteractionState('idle');
    setEmotion(null);
    setCurrentRecord(null);
  };

  const handleInteractionEnd = () => {
    // When interaction ends, generate a mock report based on current session and navigate to report view
    const newRecord: HistoryRecord = {
      session: {
        session_id: `s_${Date.now()}`,
        user_id: 'u_123',
        mode: appMode === 'video' ? 'video' : 'voice',
        start_time: new Date(Date.now() - 150000).toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: 150,
        status: 'completed',
        created_at: new Date().toISOString()
      },
      result: {
        predicted_emotion: emotion || 'calm',
        emotion_score: 0.85,
        confidence: 'high',
        emotion_keywords: ['放松', '专注']
      },
      report: {
        report_id: `r_${Date.now()}`,
        session_id: `s_${Date.now()}`,
        main_emotion: emotion || 'calm',
        emotion_trend: 'stable',
        emotion_keywords: ['放松', '专注'],
        audio_summary: ['语速适中', '音量平稳'],
        face_summary: appMode === 'video' ? ['面部表情自然'] : [],
        overall_summary: '本次交流整体平稳，情绪状态良好。此结果基于本次对话生成的总结，仅供参考。'
      }
    };
    
    // Add to top of history
    setHistoryData([newRecord, ...historyData]);
    setCurrentRecord(newRecord);
    
    setAppMode('report');
    setInteractionState('idle');
    setEmotion(null);
  };

  const handleSelectRecord = (record: HistoryRecord) => {
    setCurrentRecord(record);
    setAppMode('report');
  };

  const handleFeedbackSubmit = (sessionId: string, finalEmotion: EmotionState, supplementText?: string) => {
    setHistoryData(prevData => prevData.map(record => {
      if (record.session.session_id === sessionId) {
        const updatedRecord = {
          ...record,
          feedback: {
            feedback_id: `f_${Date.now()}`,
            session_id: sessionId,
            predicted_emotion: record.result.predicted_emotion,
            user_confirmed_emotion: finalEmotion,
            feedback_type: (finalEmotion === record.result.predicted_emotion && !supplementText) ? 'accurate' : 'supplement' as const,
            supplement_text: supplementText,
            final_emotion: finalEmotion,
            submitted_at: new Date().toISOString()
          }
        };
        if (currentRecord?.session.session_id === sessionId) {
          setCurrentRecord(updatedRecord);
        }
        return updatedRecord;
      }
      return record;
    }));
  };

  return (
    <div className="min-h-screen text-slate-800 font-sans overflow-hidden relative">
      <BackgroundDecorations state={interactionState} emotion={emotion} />

      <TopNav mode={appMode} state={interactionState} onHome={handleHome} />

      <main className="relative z-10 w-full h-screen flex flex-col items-center justify-center pt-20">
        <AnimatePresence mode="wait">
          {appMode === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full h-full"
            >
              <HomeView state={interactionState} onStart={handleStart} />
            </motion.div>
          )}

          {(appMode === 'video' || appMode === 'audio') && (
            <motion.div 
              key={`minicpm-${appMode}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full h-full"
            >
              <MiniCpmVoiceView mode={appMode} onEnd={handleInteractionEnd} />
            </motion.div>
          )}

          {appMode === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full h-full"
            >
              <HistoryView 
                onBack={handleHome} 
                onSelectRecord={handleSelectRecord} 
              />
            </motion.div>
          )}

          {appMode === 'report' && currentRecord && (
            <motion.div 
              key="report"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full h-full"
            >
              <ReportView 
                record={currentRecord} 
                onBack={() => setAppMode('history')} 
                onFeedbackSubmit={handleFeedbackSubmit}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
