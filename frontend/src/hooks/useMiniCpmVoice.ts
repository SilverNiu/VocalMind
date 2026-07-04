import { useCallback, useState } from 'react';
import { getBackendConfig } from '../lib/backendClient';
import {
  fetchMiniCpmConfig,
  MiniCpmConfig,
  startMiniCpmLocalAgent,
} from '../lib/minicpmClient';

export interface MiniCpmTranscriptLine {
  id: string;
  role: 'system' | 'assistant' | 'error';
  text: string;
}

export type MiniCpmStatus =
  | 'idle'
  | 'connecting'
  | 'queued'
  | 'listening'
  | 'speaking'
  | 'error';

export function useMiniCpmVoice() {
  const [status, setStatus] = useState<MiniCpmStatus>('idle');
  const [lines, setLines] = useState<MiniCpmTranscriptLine[]>([
    {
      id: 'intro',
      role: 'system',
      text: 'MiniCPM 已切换为本地 Agent 模式，浏览器不会申请摄像头或麦克风权限。',
    },
  ]);
  const [inputLevel, setInputLevel] = useState(0.35);
  const [config, setConfig] = useState<MiniCpmConfig | null>(null);
  const [agentCommand, setAgentCommand] = useState<string | null>(null);

  const stop = useCallback((_closeSocket = true) => {
    setStatus('idle');
    setInputLevel(0.35);
  }, []);

  const start = useCallback(async () => {
    stop(false);
    setStatus('connecting');
    setLines([
      {
        id: 'loading',
        role: 'system',
        text: '正在读取 MiniCPM 本地 Agent 配置。',
      },
    ]);

    try {
      const { apiBase } = getBackendConfig();
      const nextConfig = await fetchMiniCpmConfig(apiBase);
      const localAgent = nextConfig.local_agent;
      const mode = localAgent?.mode || 'audio';
      const script = localAgent?.script || 'scripts/local_minicpm_agent.py';
      const websocketPath = localAgent?.websocket_path || `${nextConfig.websocket_path}?mode=${mode}`;
      const directRealtimeUrl = localAgent?.minicpm_realtime_url;
      const command = directRealtimeUrl
        ? `python ${script} --api-base ${apiBase} --mode ${mode} --minicpm-realtime-url "${directRealtimeUrl}"`
        : `python ${script} --api-base ${apiBase} --websocket-path "${websocketPath}" --mode ${mode}`;
      const launcher = localAgent?.launcher;
      const launcherCommand = `python ${launcher?.script || 'scripts/local_agent_launcher.py'}`;

      setConfig(nextConfig);
      if (launcher) {
        try {
          const launcherResult = await startMiniCpmLocalAgent(launcher, {
            api_base: apiBase,
            mode,
            minicpm_realtime_url: localAgent?.minicpm_realtime_url,
          });
          setAgentCommand(null);
          setInputLevel(1);
          setStatus('listening');
          setLines([
            {
              id: 'ready',
              role: 'system',
              text: launcherResult.already_running
                ? 'Local Agent is already running from the launcher.'
                : 'Local Agent started from the launcher. Camera, microphone, and emotion sampling are running locally.',
            },
          ]);
          return;
        } catch (launcherError) {
          const launcherMessage = launcherError instanceof Error ? launcherError.message : String(launcherError);
          setAgentCommand(launcherCommand);
          setStatus('error');
          setLines([
            {
              id: 'launcher-missing',
              role: 'error',
              text: `Local launcher is not responding. Run the command below once, then click start again. ${launcherMessage}`,
            },
          ]);
          return;
        }
      }
      setAgentCommand(command);
      setInputLevel(1);
      setStatus('listening');
      setLines([
        {
          id: 'ready',
          role: 'system',
          text: '本地 Agent 已准备好。请在项目根目录运行下方命令，音频播放和摄像头采集都由本机 Python 进程完成。',
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus('error');
      setLines([
        {
          id: 'error',
          role: 'error',
          text: `无法读取 MiniCPM 后端配置：${message}`,
        },
      ]);
    }
  }, [stop]);

  return {
    agentCommand,
    config,
    inputLevel,
    isActive: status !== 'idle' && status !== 'error',
    lines,
    start,
    status,
    stop,
  };
}
