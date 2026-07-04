import { useCallback, useEffect, useState } from 'react';
import { getBackendConfig } from '../lib/backendClient';
import {
  fetchMiniCpmConfig,
  fetchMiniCpmLocalAgentStatus,
  MiniCpmConfig,
  MiniCpmEmotionStatus,
  MiniCpmLocalAgentStatus,
  shutdownMiniCpmLocalLauncher,
  startMiniCpmLocalAgent,
} from '../lib/minicpmClient';

export type MiniCpmSessionMode = 'audio' | 'video';

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

function initialLines(mode: MiniCpmSessionMode): MiniCpmTranscriptLine[] {
  return [
    {
      id: 'intro',
      role: 'system',
      text:
        mode === 'video'
          ? '视频会话待机：MiniCPM 对话，音频与人脸情绪采样。'
          : '语音会话待机：MiniCPM 对话，仅音频情绪采样。',
    },
  ];
}

function linesFromAgentStatus(
  agentStatus: MiniCpmLocalAgentStatus | null | undefined,
  mode: MiniCpmSessionMode
): MiniCpmTranscriptLine[] {
  if (agentStatus?.errors?.length) {
    return [
      {
        id: 'agent-error',
        role: 'error',
        text: agentStatus.errors[agentStatus.errors.length - 1],
      },
    ];
  }

  const cpmMessages = agentStatus?.cpm_messages?.filter(message => message.text.trim());
  if (cpmMessages?.length) {
    return cpmMessages.map(message => ({
      id: message.id,
      role: message.role,
      text: message.text,
    }));
  }

  return [
    {
      id: 'listening',
      role: 'system',
      text:
        mode === 'video'
          ? '本地 Agent 正在监听视频会话。'
          : '本地 Agent 正在监听语音会话。',
    },
  ];
}

export function useMiniCpmVoice(sessionMode: MiniCpmSessionMode) {
  const [status, setStatus] = useState<MiniCpmStatus>('idle');
  const [lines, setLines] = useState<MiniCpmTranscriptLine[]>(() => initialLines(sessionMode));
  const [inputLevel, setInputLevel] = useState(0.35);
  const [config, setConfig] = useState<MiniCpmConfig | null>(null);
  const [agentCommand, setAgentCommand] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<MiniCpmLocalAgentStatus | null>(null);
  const [emotionStatus, setEmotionStatus] = useState<MiniCpmEmotionStatus | null>(null);

  useEffect(() => {
    if (status === 'idle') {
      setLines(initialLines(sessionMode));
      setAgentStatus(null);
      setEmotionStatus(null);
    }
  }, [sessionMode, status]);

  const stop = useCallback(async (closeLauncher = true) => {
    const launcher = config?.local_agent?.launcher;
    if (closeLauncher && launcher) {
      try {
        await shutdownMiniCpmLocalLauncher(launcher);
      } catch {
        // The launcher may already be closed; ending the view should still reset local UI state.
      }
    }
    setStatus('idle');
    setInputLevel(0.35);
    setAgentStatus(null);
    setEmotionStatus(null);
  }, [config]);

  const start = useCallback(async () => {
    await stop(false);
    setStatus('connecting');
    setAgentCommand(null);
    setLines([
      {
        id: 'loading',
        role: 'system',
        text: '正在连接本地 MiniCPM Agent。',
      },
    ]);

    try {
      const { apiBase } = getBackendConfig();
      const nextConfig = await fetchMiniCpmConfig(apiBase);
      const localAgent = nextConfig.local_agent;
      const script = localAgent?.script || 'scripts/local_minicpm_agent.py';
      const websocketPath = `${nextConfig.websocket_path}?mode=${sessionMode}`;
      const directRealtimeUrl = localAgent?.minicpm_realtime_url;
      const command = directRealtimeUrl
        ? `python ${script} --api-base ${apiBase} --mode ${sessionMode} --minicpm-realtime-url "${directRealtimeUrl}"`
        : `python ${script} --api-base ${apiBase} --websocket-path "${websocketPath}" --mode ${sessionMode}`;
      const launcher = localAgent?.launcher;
      const launcherCommand = `python ${launcher?.script || 'scripts/local_agent_launcher.py'}`;

      setConfig(nextConfig);
      if (launcher) {
        try {
          const launcherResult = await startMiniCpmLocalAgent(launcher, {
            api_base: apiBase,
            mode: sessionMode,
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
                ? '本地 Agent 已在运行。'
                : '本地 Agent 已启动。',
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
              text: `本地 launcher 未响应。${launcherMessage}`,
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
          text: '本地 Agent 命令已生成。',
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus('error');
      setLines([
        {
          id: 'error',
          role: 'error',
          text: `无法读取 MiniCPM 配置：${message}`,
        },
      ]);
    }
  }, [sessionMode, stop]);

  const isActive = status !== 'idle' && status !== 'error';

  useEffect(() => {
    const launcher = config?.local_agent?.launcher;
    if (!isActive || !launcher) return;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const launcherStatus = await fetchMiniCpmLocalAgentStatus(launcher);
        if (cancelled) return;

        const nextAgentStatus = launcherStatus.status;
        setAgentStatus(nextAgentStatus || null);
        setEmotionStatus(nextAgentStatus?.last_emotion_response || null);
        setLines(linesFromAgentStatus(nextAgentStatus, sessionMode));

        if (nextAgentStatus?.errors?.length || nextAgentStatus?.ok === false) {
          setStatus('error');
        } else if (nextAgentStatus?.cpm_messages?.some(message => !message.complete)) {
          setStatus('speaking');
        } else if (launcherStatus.running || nextAgentStatus?.running) {
          setStatus('listening');
        } else {
          setStatus('error');
          setLines([
            {
              id: 'agent-stopped',
              role: 'error',
              text: '本地 Agent 已退出。',
            },
          ]);
        }

        setInputLevel(nextAgentStatus?.audio_chunks_sent ? 1.05 : 0.85);
      } catch {
        if (!cancelled) {
          setStatus('error');
          setLines([
            {
              id: 'status-error',
              role: 'error',
              text: '无法读取本地 Agent 状态。',
            },
          ]);
        }
      }
    };

    void pollStatus();
    const interval = window.setInterval(() => void pollStatus(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config, isActive, sessionMode]);

  return {
    agentCommand,
    agentStatus,
    config,
    emotionStatus,
    inputLevel,
    isActive,
    lines,
    sessionMode,
    start,
    status,
    stop,
  };
}
