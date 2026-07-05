export const formatDuration = (seconds: number) => {
  const normalized = Math.max(0, Math.floor(seconds));
  const m = Math.floor(normalized / 60);
  const s = normalized % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
};

export const getEmotionColor = (emotion: string | null) => {
  switch (emotion) {
    case 'calm': return 'text-blue-500 bg-blue-50 border-blue-100';
    case 'anxious': return 'text-orange-500 bg-orange-50 border-orange-100';
    case 'tired': return 'text-slate-500 bg-slate-50 border-slate-200';
    case 'happy': return 'text-emerald-500 bg-emerald-50 border-emerald-100';
    case 'relaxed': return 'text-cyan-500 bg-cyan-50 border-cyan-100';
    case 'focused': return 'text-indigo-500 bg-indigo-50 border-indigo-100';
    case 'neutral': return 'text-blue-500 bg-blue-50 border-blue-100';
    default: return 'text-slate-500 bg-slate-50 border-slate-100';
  }
};

export const getEmotionLabel = (emotion: string | null) => {
  switch (emotion) {
    case 'calm': return '平静';
    case 'anxious': return '轻微紧张';
    case 'tired': return '平静偏疲惫';
    case 'happy': return '开心';
    case 'relaxed': return '放松';
    case 'focused': return '专注';
    case 'neutral': return '平稳';
    default: return '未知';
  }
};
