import { HistoryRecord } from '../types';

export const mockHistory: HistoryRecord[] = [
  {
    session: {
      session_id: 's_001',
      user_id: 'u_123',
      mode: 'voice',
      start_time: '2023-07-04T10:00:00Z',
      end_time: '2023-07-04T10:03:20Z',
      duration_seconds: 200,
      status: 'completed',
      created_at: '2023-07-04T10:03:20Z'
    },
    result: {
      predicted_emotion: 'tired',
      emotion_score: 0.8,
      confidence: 'medium',
      audio_emotion: 'tired',
      audio_confidence: '0.85',
      face_emotion: null,
      face_confidence: null,
      emotion_keywords: ['放松', '专注', '轻微疲惫']
    },
    report: {
      report_id: 'r_001',
      session_id: 's_001',
      main_emotion: 'tired',
      emotion_trend: 'stable_to_tired',
      emotion_keywords: ['放松', '专注', '轻微疲惫'],
      audio_summary: ['语速略慢', '音量较平稳', '停顿稍多', '语气较平和'],
      face_summary: [],
      overall_summary: '本次交流整体较平稳，你的语气和表情都比较放松，但在后半段节奏略有放慢，可能带有一点疲惫感。这个结果仅作为一次交流状态参考。'
    },
    feedback: {
      feedback_id: 'f_001',
      session_id: 's_001',
      predicted_emotion: 'tired',
      user_confirmed_emotion: 'tired', // Confirmed as tired but mixed with calm
      feedback_type: 'accurate',
      final_emotion: 'tired', // or maybe 'calm' mixed, the user wanted "平静偏疲惫" -> we can map tired to "平静偏疲惫" for display
      submitted_at: '2023-07-04T10:04:00Z'
    }
  },
  {
    session: {
      session_id: 's_002',
      user_id: 'u_123',
      mode: 'video',
      start_time: '2023-07-03T15:30:00Z',
      end_time: '2023-07-03T15:32:10Z',
      duration_seconds: 130,
      status: 'completed',
      created_at: '2023-07-03T15:32:10Z'
    },
    result: {
      predicted_emotion: 'anxious',
      emotion_score: 0.75,
      confidence: 'high',
      audio_emotion: 'anxious',
      audio_confidence: '0.7',
      face_emotion: 'anxious',
      face_confidence: '0.8',
      emotion_keywords: ['紧绷', '心率稍快', '不安']
    },
    report: {
      report_id: 'r_002',
      session_id: 's_002',
      main_emotion: 'anxious',
      emotion_trend: 'slightly_anxious',
      emotion_keywords: ['紧绷', '轻度焦虑', '不安'],
      audio_summary: ['语速稍快', '音调偏高'],
      face_summary: ['眉头微皱', '眼部略显紧张'],
      overall_summary: '本次交流中，你似乎带有一点紧张和焦虑。建议在忙碌之余，深呼吸，给自己一点放松的时间。'
    }
  },
  {
    session: {
      session_id: 's_003',
      user_id: 'u_123',
      mode: 'video',
      start_time: '2023-07-02T09:15:00Z',
      end_time: '2023-07-02T09:19:05Z',
      duration_seconds: 245,
      status: 'completed',
      created_at: '2023-07-02T09:19:05Z'
    },
    result: {
      predicted_emotion: 'calm',
      emotion_score: 0.9,
      confidence: 'high',
      audio_emotion: 'calm',
      audio_confidence: '0.9',
      face_emotion: 'calm',
      face_confidence: '0.85',
      emotion_keywords: ['放松', '轻盈', '平和']
    },
    report: {
      report_id: 'r_003',
      session_id: 's_003',
      main_emotion: 'calm',
      emotion_trend: 'stable',
      emotion_keywords: ['放松', '轻盈', '平和'],
      audio_summary: ['语气平和', '节奏适中'],
      face_summary: ['面部整体放松', '自然微笑'],
      overall_summary: '你看起来状态很好，情绪非常平稳，继续保持这份宁静。'
    }
  }
];

export const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
};

export const getEmotionColor = (emotion: string | null) => {
  switch (emotion) {
    case 'calm': return 'text-blue-500 bg-blue-50 border-blue-100';
    case 'anxious': return 'text-orange-500 bg-orange-50 border-orange-100';
    case 'tired': return 'text-slate-500 bg-slate-50 border-slate-200';
    case 'happy': return 'text-emerald-500 bg-emerald-50 border-emerald-100';
    default: return 'text-slate-500 bg-slate-50 border-slate-100';
  }
};

export const getEmotionLabel = (emotion: string | null) => {
  switch (emotion) {
    case 'calm': return '平静';
    case 'anxious': return '轻微紧张';
    case 'tired': return '平静偏疲惫';
    case 'happy': return '开心';
    default: return '未知';
  }
};
