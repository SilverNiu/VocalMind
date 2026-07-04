import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Headphones,
  MessageCircle,
  Mic,
  PhoneOff,
  Radio,
  Terminal,
  Video,
  Volume2,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import {
  MiniCpmSessionMode,
  MiniCpmStatus,
  useMiniCpmVoice,
} from '../hooks/useMiniCpmVoice';

interface MiniCpmVoiceViewProps {
  mode: MiniCpmSessionMode;
  onEnd: () => void;
}

const statusText: Record<MiniCpmStatus, string> = {
  idle: '未连接',
  connecting: '连接中',
  queued: '排队中',
  listening: '监听中',
  speaking: '回复中',
  error: '异常',
};

const modeMeta = {
  audio: {
    title: '语音对话',
    subtitle: 'MiniCPM realtime demo',
    startLabel: '开始语音',
    frameLabel: '麦克风实时输入',
    note: '小模型情绪识别已关闭，音频只进入 MiniCPM。',
    icon: Mic,
  },
  video: {
    title: '视频对话',
    subtitle: 'MiniCPM realtime demo',
    startLabel: '开始视频',
    frameLabel: '摄像头实时输入',
    note: '小模型情绪识别已关闭，视频帧只进入 MiniCPM。',
    icon: Camera,
  },
} satisfies Record<MiniCpmSessionMode, {
  title: string;
  subtitle: string;
  startLabel: string;
  frameLabel: string;
  note: string;
  icon: typeof Mic;
}>;

export function MiniCpmVoiceView({ mode, onEnd }: MiniCpmVoiceViewProps) {
  const meta = modeMeta[mode];
  const ModeIcon = meta.icon;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const {
    attachVideoElement,
    config,
    debugEntries,
    inputLevel,
    isActive,
    lines,
    start,
    status,
    stop,
  } = useMiniCpmVoice(mode);

  useEffect(() => {
    attachVideoElement(videoRef.current);
  }, [attachVideoElement]);

  const handleEnd = async () => {
    await stop();
    onEnd();
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
              <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur">
                <ModeIcon className="h-4 w-4" />
                {meta.frameLabel}
              </div>
              <div className="absolute right-4 top-4 z-20 rounded-full bg-emerald-400/18 px-3 py-1.5 text-[12px] text-emerald-100">
                MiniCPM only
              </div>

              {mode === 'video' ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  autoPlay
                />
              ) : (
                <div className="flex h-full items-center justify-center">
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
                    ) : (
                      <Headphones className="h-16 w-16" />
                    )}
                  </motion.div>
                </div>
              )}

              <div className="absolute bottom-4 left-4 right-4 z-20 rounded-md bg-white/10 px-3 py-2 text-[12px] leading-relaxed text-white/78 backdrop-blur">
                {meta.note}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/80 bg-white/68 px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-slate-500">
                  <Mic className="h-4 w-4 text-blue-500" />
                  输入格式
                </div>
                <div className="text-[17px] font-semibold text-[#1a2b4c]">
                  {config?.input_audio.sample_rate || 16000}Hz float32 PCM
                </div>
              </div>
              <div className="rounded-lg border border-white/80 bg-white/68 px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-slate-500">
                  <Volume2 className="h-4 w-4 text-blue-500" />
                  输出格式
                </div>
                <div className="text-[17px] font-semibold text-[#1a2b4c]">
                  {config?.output_audio.sample_rate || 24000}Hz PCM 播放
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
            <button
              onClick={() => void start()}
              disabled={isActive}
              className="flex h-12 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-500 px-6 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Terminal className="h-5 w-5" />
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

        <GlassCard className="flex min-h-[560px] flex-col border-white/80 bg-white/70 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-slate-800">CPM 聊天窗口</h2>
                <p className="text-[12px] text-slate-400">
                  /voice/minicpm WebSocket proxy
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1.5 text-[12px] text-slate-500">
              <Video className="h-3.5 w-3.5" />
              mode={mode}
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {lines.map(line => (
              <div
                key={line.id}
                className={
                  line.role === 'assistant'
                    ? 'ml-auto max-w-[86%] rounded-lg bg-blue-500 px-4 py-3 text-[14px] leading-relaxed text-white'
                    : line.role === 'error'
                      ? 'max-w-[90%] rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[14px] leading-relaxed text-rose-600'
                      : 'max-w-[90%] rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-[14px] leading-relaxed text-slate-500'
                }
              >
                {line.text}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-950/90 px-4 py-3 shadow-inner">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-slate-100">MiniCPM demo 调试</span>
              <span className="text-[11px] text-slate-400">{debugEntries.length} 条</span>
            </div>
            <div className="max-h-[150px] space-y-3 overflow-y-auto pr-1">
              {debugEntries.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-slate-400">
                  点击开始后，配置、WebSocket 和 MiniCPM realtime 事件会显示在这里。
                </p>
              ) : (
                debugEntries.map(entry => (
                  <div key={entry.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                    <div className="mb-2 text-[12px] font-medium text-cyan-200">{entry.label}</div>
                    <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-200">
                      {formatDebugPayload(entry.payload)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function formatDebugPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
