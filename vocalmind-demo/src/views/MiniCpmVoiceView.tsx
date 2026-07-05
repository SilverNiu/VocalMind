import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Camera,
  Headphones,
  MessageCircle,
  Mic,
  PhoneOff,
  Radio,
  UserRound,
  Volume2,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import {
  MiniCpmSessionMode,
  MiniCpmStatus,
  useMiniCpmVoice,
} from '../hooks/useMiniCpmVoice';
import { MiniCpmEmotionPrediction } from '../lib/minicpmClient';
import { MiniCpmSessionSnapshot } from '../types';

interface MiniCpmVoiceViewProps {
  mode: MiniCpmSessionMode;
  onEnd: (snapshot: MiniCpmSessionSnapshot | null) => void;
}

const statusText: Record<MiniCpmStatus, string> = {
  idle: '未连接',
  connecting: '连接中',
  queued: '排队中',
  listening: '聆听中',
  speaking: '回复中',
  error: '异常',
};

const modeMeta = {
  audio: {
    title: '语音对话',
    subtitle: 'MiniCPM 实时语音',
    startLabel: '开始语音',
    portraitLabel: '语音会话',
    sampleLabel: '语音情绪模型',
    icon: Mic,
  },
  video: {
    title: '视频对话',
    subtitle: 'MiniCPM 实时视频',
    startLabel: '开始视频',
    portraitLabel: '摄像头采样',
    sampleLabel: '语音 + 图像情绪模型',
    icon: Camera,
  },
} satisfies Record<MiniCpmSessionMode, {
  title: string;
  subtitle: string;
  startLabel: string;
  portraitLabel: string;
  sampleLabel: string;
  icon: typeof Mic;
}>;

function predictionText(prediction?: MiniCpmEmotionPrediction | null): string {
  return prediction?.label?.trim() || '等待采样';
}

function confidenceText(prediction?: MiniCpmEmotionPrediction | null): string {
  if (typeof prediction?.confidence !== 'number') return '--';
  return `${Math.round(prediction.confidence * 100)}%`;
}

function EmotionPill({
  title,
  prediction,
  icon: Icon,
  emptyText,
}: {
  title: string;
  prediction?: MiniCpmEmotionPrediction | null;
  icon: typeof Activity;
  emptyText?: string;
}) {
  const hasValue = Boolean(prediction?.label);
  return (
    <div className="rounded-lg border border-white/80 bg-white/68 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
          <Icon className="h-4 w-4 text-blue-500" />
          {title}
        </div>
        <span className="text-[12px] tabular-nums text-slate-400">
          {confidenceText(prediction)}
        </span>
      </div>
      <div className={hasValue ? 'text-[20px] font-semibold text-[#1a2b4c]' : 'text-[17px] font-medium text-slate-400'}>
        {prediction?.label?.trim() || emptyText || predictionText(prediction)}
      </div>
    </div>
  );
}

export function MiniCpmVoiceView({ mode, onEnd }: MiniCpmVoiceViewProps) {
  const meta = modeMeta[mode];
  const ModeIcon = meta.icon;
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const {
    agentStatus,
    config,
    emotionStatus,
    faceEmotionIssue,
    inputLevel,
    isActive,
    lines,
    start,
    status,
    stop,
    transcriptLines,
    videoRef,
  } = useMiniCpmVoice(mode);
  const chatLines = transcriptLines.length ? transcriptLines : lines;
  const assistantReplyCount = useMemo(
    () => chatLines.filter(line => line.role === 'assistant' && line.text.trim()).length,
    [chatLines]
  );
  const connectionLabel = config
    ? (config.auth_configured ? 'MiniCPM 实时响应' : 'MiniCPM 配置待确认')
    : '等待后端配置';
  const primaryEmotionLabel =
    emotionStatus?.fusion_emotion?.label?.trim() ||
    emotionStatus?.audio_emotion?.label?.trim() ||
    '等待采样';
  const audioFlowLabel = isActive && (agentStatus?.audio_chunks_sent || 0) > 0 ? '传输中' : '待启动';
  const videoFlowLabel =
    mode === 'video'
      ? (isActive && (agentStatus?.video_frames_sent || 0) > 0 ? '采集中' : '待启动')
      : '未开启';
  const emotionFlowLabel =
    isActive && (agentStatus?.emotion_requests_sent || 0) > 0 ? '分析中' : '待采样';

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [chatLines, status]);

  const handleEnd = async () => {
    const snapshot = await stop(true, true);
    onEnd(snapshot);
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-5 pb-8 pt-8 md:px-10">
      <div data-testid={`minicpm-${mode}-view`} className="grid w-full max-w-6xl grid-cols-1 items-stretch gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <GlassCard className="flex min-h-[560px] flex-col justify-between border-white/80 bg-white/70 p-5 md:p-6">
          <div>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-[13px] font-medium text-blue-500">{meta.subtitle}</p>
                <h1 className="text-[30px] font-semibold leading-tight text-[#1a2b4c] md:text-[34px]">
                  {meta.title}
                </h1>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white bg-white/80 px-3 py-2 text-[13px] text-slate-600">
                <Radio className="h-4 w-4 text-blue-500" />
                {statusText[status]}
              </div>
            </div>

            <div className="relative mb-5 overflow-hidden rounded-lg border border-white/80 bg-slate-950/90 aspect-[4/3]">
              {mode === 'video' && (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-300 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}
              <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur">
                <ModeIcon className="h-4 w-4" />
                {meta.portraitLabel}
              </div>
              <div className="absolute right-4 top-4 z-10 rounded-full bg-emerald-400/18 px-3 py-1.5 text-[12px] text-emerald-100">
                {meta.sampleLabel}
              </div>
              <div className={`flex h-full items-center justify-center ${mode === 'video' && isActive ? 'bg-slate-950/10' : ''}`}>
                {!(mode === 'video' && isActive) && (
                  <motion.div
                    animate={{
                      scale: isActive ? [1, inputLevel, 1] : 1,
                      opacity: status === 'error' ? 0.45 : 1,
                    }}
                    transition={{ duration: 0.9, repeat: isActive ? Infinity : 0 }}
                    className="flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 text-white shadow-[0_18px_55px_rgba(37,99,235,0.34)]"
                  >
                    {status === 'speaking' ? (
                      <Volume2 className="h-16 w-16" />
                    ) : mode === 'video' ? (
                      <UserRound className="h-16 w-16" />
                    ) : (
                      <Headphones className="h-16 w-16" />
                    )}
                  </motion.div>
                )}
              </div>
              <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2 text-[12px] text-white/78">
                <div className="rounded-md bg-white/10 px-3 py-2 backdrop-blur">
                  语音流 {audioFlowLabel}
                </div>
                <div className="rounded-md bg-white/10 px-3 py-2 backdrop-blur">
                  视频流 {videoFlowLabel}
                </div>
                <div className="rounded-md bg-white/10 px-3 py-2 backdrop-blur">
                  情绪分析 {emotionFlowLabel}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <EmotionPill
                title="语音情绪"
                prediction={emotionStatus?.audio_emotion}
                icon={Headphones}
              />
              {mode === 'video' && (
                <EmotionPill
                  title="图像情绪"
                  prediction={emotionStatus?.face_emotion}
                  icon={Camera}
                  emptyText={faceEmotionIssue || undefined}
                />
              )}
              {mode === 'video' && (
                <div className="md:col-span-2">
                  <EmotionPill
                    title="融合判定"
                    prediction={emotionStatus?.fusion_emotion}
                    icon={Activity}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
            <button
              onClick={() => void start()}
              disabled={isActive}
              className="flex h-12 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-500 px-6 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ModeIcon className="h-5 w-5" />
              {meta.startLabel}
            </button>
            <button
              onClick={() => void handleEnd()}
              className="flex h-12 items-center gap-2 whitespace-nowrap rounded-lg border border-rose-100 bg-rose-50 px-5 font-medium text-rose-500 transition-colors hover:bg-rose-100"
            >
              <PhoneOff className="h-5 w-5" />
              结束
            </button>
          </div>
        </GlassCard>

        <GlassCard className="flex min-h-[560px] flex-col overflow-hidden border-white/80 bg-white/72 p-0">
          <div className="border-b border-white/70 bg-white/62 px-5 py-4 md:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white shadow-[0_10px_26px_rgba(59,130,246,0.22)]">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-[18px] font-semibold text-slate-800">MiniCPM 聊天窗口</h2>
                  <p className="text-[12px] text-slate-400">{connectionLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white bg-white/82 px-3 py-1.5 text-[12px] text-slate-500">
                <span className={`h-2 w-2 rounded-full ${
                  status === 'error'
                    ? 'bg-rose-400'
                    : isActive
                      ? 'bg-emerald-400'
                      : 'bg-slate-300'
                }`} />
                {statusText[status]}
              </div>
            </div>
          </div>

          <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.46),rgba(239,246,255,0.46))] px-5 py-5 md:px-6"
          >
            {assistantReplyCount === 0 && (
              <div className="rounded-lg border border-dashed border-blue-100 bg-white/45 px-4 py-5 text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <p className="text-[13px] font-medium text-slate-500">
                  等待 MiniCPM 回复内容
                </p>
                <p className="mt-1 text-[12px] text-slate-400">
                  如果上游仅返回语音音频，这里会显示语音回复状态。
                </p>
              </div>
            )}
            {chatLines.map(line => {
              if (line.role === 'user') {
                return (
                  <div key={line.id} className="flex justify-end">
                    <div className="max-w-[82%] rounded-lg bg-blue-500 px-4 py-3 text-[14px] leading-relaxed text-white shadow-[0_8px_22px_rgba(37,99,235,0.14)]">
                      <div className="mb-1 text-right text-[12px] font-medium text-blue-100">我</div>
                      <div className="whitespace-pre-wrap break-words">{line.text}</div>
                    </div>
                  </div>
                );
              }

              if (line.role === 'assistant') {
                return (
                  <div key={line.id} className="flex items-start gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="max-w-[88%] rounded-lg border border-blue-100/80 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                      <div className="mb-1 text-[12px] font-medium text-blue-500">MiniCPM</div>
                      <div className="whitespace-pre-wrap break-words">{line.text}</div>
                    </div>
                  </div>
                );
              }

              if (line.role === 'error') {
                return (
                  <div
                    key={line.id}
                    className="max-w-[90%] rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[14px] leading-relaxed text-rose-600"
                  >
                    {line.text}
                  </div>
                );
              }

              return (
                <div
                  key={line.id}
                  className="mx-auto max-w-[92%] rounded-full border border-white/80 bg-white/70 px-4 py-2 text-center text-[12px] leading-relaxed text-slate-500"
                >
                  {line.text}
                </div>
              );
            })}
          </div>

          <div className="border-t border-white/70 bg-white/68 px-5 py-4 md:px-6">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-white/80 bg-white/72 px-3 py-2">
                <div className="text-[11px] text-slate-400">会话状态</div>
                <div className="mt-1 truncate text-[15px] font-semibold text-[#1a2b4c]">
                  {assistantReplyCount > 0 ? '正在对话' : statusText[status]}
                </div>
              </div>
              <div className="rounded-lg border border-white/80 bg-white/72 px-3 py-2">
                <div className="text-[11px] text-slate-400">情绪判定</div>
                <div className="mt-1 truncate text-[15px] font-semibold text-[#1a2b4c]">
                  {primaryEmotionLabel}
                </div>
              </div>
              <div className="rounded-lg border border-white/80 bg-white/72 px-3 py-2">
                <div className="text-[11px] text-slate-400">对话模式</div>
                <div className="mt-1 truncate text-[15px] font-semibold text-[#1a2b4c]">
                  {mode === 'video' ? '视频' : '语音'}
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
