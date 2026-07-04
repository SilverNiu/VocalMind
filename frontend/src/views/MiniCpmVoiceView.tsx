import { motion } from 'motion/react';
import { Camera, Headphones, Mic, PhoneOff, Radio, ShieldCheck, Terminal, Volume2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useMiniCpmVoice } from '../hooks/useMiniCpmVoice';

interface MiniCpmVoiceViewProps {
  onEnd: () => void;
}

const statusText = {
  idle: '未连接',
  connecting: '读取配置',
  queued: '排队中',
  listening: 'Agent 就绪',
  speaking: '回复中',
  error: '配置异常',
};

export function MiniCpmVoiceView({ onEnd }: MiniCpmVoiceViewProps) {
  const {
    agentCommand,
    config,
    inputLevel,
    isActive,
    lines,
    start,
    status,
    stop,
  } = useMiniCpmVoice();

  const handleEnd = async () => {
    await stop(true);
    onEnd();
  };

  return (
    <div className="w-full h-full px-5 md:px-10 pt-8 pb-10 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-5 items-stretch">
        <GlassCard className="p-6 md:p-8 bg-white/70 border-white/80 flex flex-col justify-between min-h-[520px]">
          <div>
            <div className="flex items-center justify-between gap-4 mb-8">
              <div>
                <p className="text-[13px] text-blue-500 font-medium mb-2">MiniCPM-o 4.5 Realtime</p>
                <h1 className="text-[30px] md:text-[36px] leading-tight font-semibold text-[#1a2b4c]">
                  本地实时陪伴
                </h1>
              </div>
              <div className="px-3 py-2 rounded-full bg-white/80 border border-white text-[13px] text-slate-600 flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-500" />
                {statusText[status]}
              </div>
            </div>

            <div className="flex justify-center py-8">
              <motion.div
                animate={{
                  scale: isActive ? [1, inputLevel, 1] : 1,
                  boxShadow: isActive
                    ? [
                        '0 0 0 0 rgba(59,130,246,0.2)',
                        '0 0 0 24px rgba(59,130,246,0.04)',
                        '0 0 0 0 rgba(59,130,246,0.2)',
                      ]
                    : '0 18px 50px rgba(37,99,235,0.16)',
                }}
                transition={{ duration: 0.9, repeat: isActive ? Infinity : 0 }}
                className="w-40 h-40 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center text-white"
              >
                {status === 'speaking' ? (
                  <Volume2 className="w-16 h-16" />
                ) : status === 'listening' ? (
                  <Camera className="w-16 h-16" />
                ) : (
                  <Mic className="w-16 h-16" />
                )}
              </motion.div>
            </div>

            <div className="space-y-3 text-[14px] text-slate-500">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                API key 只保存在后端，前端只连接 VocalMind 代理。
              </div>
              <div className="flex items-center gap-3">
                <Headphones className="w-4 h-4 text-blue-500" />
                摄像头和麦克风由本地 Python Agent 采集，浏览器不再申请媒体权限。
              </div>
              {config && (
                <div className="text-[12px] text-slate-400 pt-1">
                  输入 {config.input_audio.sample_rate}Hz 音频
                  {config.input_video ? ` + ${config.input_video.encoding} 视频帧` : ''}
                  {' '} / 输出 {config.output_audio.sample_rate}Hz
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 pt-8">
            <button
              onClick={() => void start()}
              disabled={isActive}
              className="h-12 px-7 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-2"
            >
              <Terminal className="w-5 h-5" />
              Start Agent
            </button>
            <button
              onClick={() => void handleEnd()}
              className="h-12 px-6 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-500 font-medium transition-colors flex items-center gap-2"
            >
              <PhoneOff className="w-5 h-5" />
              结束
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-5 md:p-6 bg-white/70 border-white/80 min-h-[520px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[18px] font-semibold text-slate-800">本地 Agent 状态</h2>
            <span className="text-[12px] text-slate-400">
              WebSocket {config?.local_agent?.websocket_path || '/voice/minicpm?mode=audio'}
            </span>
          </div>
          {agentCommand && (
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-blue-600 mb-2">
                <Terminal className="w-4 h-4" />
                项目根目录运行
              </div>
              <code className="block whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-700">
                {agentCommand}
              </code>
            </div>
          )}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {lines.map(line => (
              <div
                key={line.id}
                className={
                  line.role === 'assistant'
                    ? 'ml-auto max-w-[86%] rounded-2xl rounded-tr-md bg-blue-500 px-4 py-3 text-white text-[14px] leading-relaxed'
                    : line.role === 'error'
                      ? 'max-w-[90%] rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-rose-600 text-[14px] leading-relaxed'
                      : 'max-w-[90%] rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-slate-500 text-[14px] leading-relaxed'
                }
              >
                {line.text}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
