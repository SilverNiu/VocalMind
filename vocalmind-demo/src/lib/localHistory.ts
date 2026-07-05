import {
  EmotionState,
  HistoryRecord,
  MiniCpmSessionSnapshot,
  RecordedEmotionSample,
} from '../types';

const STORAGE_KEY = 'vocalmind.realHistory.v1';
const MAX_HISTORY_RECORDS = 30;

export function loadLocalHistory(): HistoryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryRecord) : [];
  } catch {
    return [];
  }
}

export function saveLocalHistory(records: HistoryRecord[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(records.slice(0, MAX_HISTORY_RECORDS))
  );
}

export function prependLocalHistory(record: HistoryRecord): HistoryRecord[] {
  const next = [
    record,
    ...loadLocalHistory().filter(item => item.session.session_id !== record.session.session_id),
  ].slice(0, MAX_HISTORY_RECORDS);
  saveLocalHistory(next);
  return next;
}

export function updateLocalHistoryRecord(updatedRecord: HistoryRecord): HistoryRecord[] {
  const next = loadLocalHistory().map(record =>
    record.session.session_id === updatedRecord.session.session_id ? updatedRecord : record
  );
  saveLocalHistory(next);
  return next;
}

export function buildHistoryRecordFromSnapshot(snapshot: MiniCpmSessionSnapshot): HistoryRecord {
  const sessionId = `s_${Date.now()}`;
  const mainPrediction = pickMainEmotion(snapshot);
  const audioLabel = normalizeEmotion(snapshot.latest_audio_emotion?.label);
  const faceLabel = normalizeEmotion(snapshot.latest_face_emotion?.label);
  const confidence = mainPrediction.confidence ?? 0;
  const keywords = buildEmotionKeywords(snapshot.emotion_samples, mainPrediction.label);

  return {
    session: {
      session_id: sessionId,
      user_id: 'local',
      mode: snapshot.mode === 'video' ? 'video' : 'voice',
      start_time: snapshot.started_at,
      end_time: snapshot.ended_at,
      duration_seconds: snapshot.duration_seconds,
      status: 'completed',
      created_at: snapshot.ended_at,
    },
    result: {
      predicted_emotion: mainPrediction.emotion,
      emotion_score: confidence || 0,
      confidence: confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low',
      audio_emotion: audioLabel.emotion,
      audio_confidence:
        typeof snapshot.latest_audio_emotion?.confidence === 'number'
          ? String(snapshot.latest_audio_emotion.confidence)
          : undefined,
      face_emotion: faceLabel.emotion,
      face_confidence:
        typeof snapshot.latest_face_emotion?.confidence === 'number'
          ? String(snapshot.latest_face_emotion.confidence)
          : undefined,
      emotion_keywords: keywords,
    },
    report: {
      report_id: `r_${Date.now()}`,
      session_id: sessionId,
      main_emotion: mainPrediction.emotion,
      emotion_trend: buildEmotionTrend(snapshot.emotion_samples),
      emotion_keywords: keywords,
      audio_summary: buildAudioSummary(snapshot),
      face_summary: buildFaceSummary(snapshot),
      overall_summary: buildOverallSummary(snapshot, mainPrediction.label),
    },
    transcript: snapshot.transcript,
    emotion_samples: snapshot.emotion_samples,
  };
}

function isHistoryRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as HistoryRecord;
  return Boolean(record.session?.session_id && record.report?.report_id && record.result);
}

function pickMainEmotion(snapshot: MiniCpmSessionSnapshot) {
  const prediction =
    snapshot.latest_fusion_emotion ||
    snapshot.latest_audio_emotion ||
    snapshot.latest_face_emotion ||
    mostFrequentEmotion(snapshot.emotion_samples);
  const label = prediction?.label?.trim() || 'neutral';
  return {
    label,
    emotion: normalizeEmotion(label).emotion,
    confidence: prediction?.confidence,
  };
}

function mostFrequentEmotion(samples: RecordedEmotionSample[]) {
  const counts = new Map<string, { count: number; confidence: number; label: string }>();
  for (const sample of samples) {
    if (!sample.label.trim()) continue;
    const key = sample.label.trim().toLowerCase();
    const prev = counts.get(key) || { count: 0, confidence: 0, label: sample.label.trim() };
    counts.set(key, {
      count: prev.count + 1,
      confidence: prev.confidence + (sample.confidence || 0),
      label: prev.label,
    });
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const top = ranked[0];
  return top
    ? { label: top.label, confidence: top.confidence / Math.max(1, top.count) }
    : null;
}

export function normalizeEmotion(label?: string | null): { emotion: EmotionState; display: string } {
  const text = (label || '').trim().toLowerCase();
  if (!text) return { emotion: null, display: '未知' };
  if (text.includes('happy') || text.includes('joy') || text.includes('开心') || text.includes('高兴')) {
    return { emotion: 'happy', display: '开心' };
  }
  if (text.includes('anx') || text.includes('fear') || text.includes('紧张') || text.includes('焦虑')) {
    return { emotion: 'anxious', display: '轻微紧张' };
  }
  if (text.includes('tired') || text.includes('sad') || text.includes('疲') || text.includes('低落')) {
    return { emotion: 'tired', display: '平静偏疲惫' };
  }
  if (text.includes('focus') || text.includes('专注')) {
    return { emotion: 'focused', display: '专注' };
  }
  if (text.includes('relax') || text.includes('放松')) {
    return { emotion: 'relaxed', display: '放松' };
  }
  if (text.includes('calm') || text.includes('平静')) {
    return { emotion: 'calm', display: '平静' };
  }
  if (text.includes('neutral') || text.includes('中性') || text.includes('自然')) {
    return { emotion: 'neutral', display: '平稳' };
  }
  return { emotion: 'neutral', display: label || '平稳' };
}

function buildEmotionKeywords(samples: RecordedEmotionSample[], fallbackLabel: string): string[] {
  const labels = samples
    .map(sample => normalizeEmotion(sample.label).display)
    .filter(Boolean);
  const unique = Array.from(new Set(labels));
  if (unique.length) return unique.slice(0, 4);
  return [normalizeEmotion(fallbackLabel).display, '真实采样'];
}

function buildEmotionTrend(samples: RecordedEmotionSample[]): string {
  const labels = samples.map(sample => normalizeEmotion(sample.label).display);
  if (labels.length < 2) return 'stable';
  return new Set(labels).size <= 1 ? 'stable' : 'changed';
}

function buildAudioSummary(snapshot: MiniCpmSessionSnapshot): string[] {
  const audioSamples = snapshot.emotion_samples.filter(sample => sample.source === 'audio');
  if (!audioSamples.length) return ['本次没有形成有效语音情绪采样'];
  const latest = audioSamples[audioSamples.length - 1];
  const summary = [`最近语音情绪为 ${normalizeEmotion(latest.label).display}`];
  if (typeof latest.confidence === 'number') {
    summary.push(`语音置信度 ${Math.round(latest.confidence * 100)}%`);
  }
  summary.push(`共记录 ${audioSamples.length} 次语音情绪采样`);
  return summary;
}

function buildFaceSummary(snapshot: MiniCpmSessionSnapshot): string[] {
  if (snapshot.mode !== 'video') return [];
  const faceSamples = snapshot.emotion_samples.filter(sample => sample.source === 'face');
  if (!faceSamples.length) return ['本次未形成有效图像情绪结果'];
  const latest = faceSamples[faceSamples.length - 1];
  const summary = [`最近图像情绪为 ${normalizeEmotion(latest.label).display}`];
  if (typeof latest.confidence === 'number') {
    summary.push(`图像置信度 ${Math.round(latest.confidence * 100)}%`);
  }
  summary.push(`共记录 ${faceSamples.length} 次图像情绪采样`);
  return summary;
}

function buildOverallSummary(snapshot: MiniCpmSessionSnapshot, label: string): string {
  const replyCount = snapshot.transcript.filter(line =>
    line.role === 'assistant' && !line.text.includes('本轮未返回可显示文本')
  ).length;
  const emotionText = normalizeEmotion(label).display;
  const durationText = formatDuration(snapshot.duration_seconds);
  return `本次${snapshot.mode === 'video' ? '视频' : '语音'}交流持续 ${durationText}，系统基于真实会话记录形成总结。当前主要状态为${emotionText}，共记录 ${snapshot.emotion_samples.length} 条情绪采样，MiniCPM 回复 ${replyCount} 条。此结果仅供参考。`;
}

export const formatDuration = (seconds: number) => {
  const normalized = Math.max(0, Math.floor(seconds));
  const m = Math.floor(normalized / 60);
  const s = normalized % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
};
