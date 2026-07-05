export type AppMode = 'home' | 'video' | 'audio' | 'history' | 'report';

export type InteractionState = 
  | 'idle' 
  | 'listening' 
  | 'analyzing' 
  | 'feedback' 
  | 'comfort';

export type EmotionState = 'calm' | 'anxious' | 'tired' | 'happy' | 'relaxed' | 'focused' | 'neutral' | null;

export interface SessionData {
  state: InteractionState;
  emotion: EmotionState;
}

// Data Models for backend integration
export interface SessionRecord {
  session_id: string;
  user_id: string;
  mode: 'video' | 'voice';
  start_time: string;
  end_time: string;
  duration_seconds: number;
  status: 'completed' | 'analyzing' | 'listening';
  created_at: string;
}

export interface ConversationTranscriptLine {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'error';
  text: string;
  created_at: string;
}

export interface RecordedEmotionSample {
  captured_at: string;
  source: 'audio' | 'face' | 'fusion';
  label: string;
  confidence?: number;
}

export interface EmotionResult {
  predicted_emotion: EmotionState;
  emotion_score: number;
  confidence: 'high' | 'medium' | 'low';
  audio_emotion?: EmotionState;
  audio_confidence?: string;
  face_emotion?: EmotionState;
  face_confidence?: string;
  emotion_keywords: string[];
}

export interface Report {
  report_id: string;
  session_id: string;
  main_emotion: EmotionState;
  emotion_trend: string;
  emotion_keywords: string[];
  audio_summary?: string[];
  face_summary?: string[];
  overall_summary: string;
}

export interface Feedback {
  feedback_id: string;
  session_id: string;
  predicted_emotion: EmotionState;
  user_confirmed_emotion: EmotionState;
  feedback_type: 'accurate' | 'inaccurate' | 'supplement';
  supplement_text?: string;
  final_emotion: EmotionState;
  submitted_at: string;
}

// Combined view model for History
export interface HistoryRecord {
  session: SessionRecord;
  result: EmotionResult;
  report: Report;
  transcript?: ConversationTranscriptLine[];
  emotion_samples?: RecordedEmotionSample[];
  feedback?: Feedback;
}

export interface MiniCpmSessionSnapshot {
  mode: 'audio' | 'video';
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  transcript: ConversationTranscriptLine[];
  emotion_samples: RecordedEmotionSample[];
  latest_audio_emotion?: {
    label?: string;
    confidence?: number;
  } | null;
  latest_face_emotion?: {
    label?: string;
    confidence?: number;
  } | null;
  latest_fusion_emotion?: {
    label?: string;
    confidence?: number;
  } | null;
}
