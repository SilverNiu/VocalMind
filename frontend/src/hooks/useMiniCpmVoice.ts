import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackendConfig } from '../lib/backendClient';
import {
  buildMiniCpmWebSocketUrl,
  fetchMiniCpmConfig,
  MiniCpmConfig,
} from '../lib/minicpmClient';
import {
  MiniCpmRealtimeSession,
  MiniCpmRealtimeStatus,
} from '../lib/minicpmRealtime';

export type MiniCpmSessionMode = 'audio' | 'video';

export interface MiniCpmTranscriptLine {
  id: string;
  role: 'system' | 'assistant' | 'error';
  text: string;
}

export interface MiniCpmDebugEntry {
  id: string;
  label: string;
  payload: unknown;
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
          ? '视频会话待机：MiniCPM 对话，摄像头画面只发送给 MiniCPM，不启用小模型。'
          : '语音会话待机：MiniCPM 对话，不启用小模型情绪识别。',
    },
  ];
}

function mapRealtimeStatus(status: MiniCpmRealtimeStatus): MiniCpmStatus {
  if (status === 'closed') return 'idle';
  return status;
}

export function useMiniCpmVoice(sessionMode: MiniCpmSessionMode) {
  const [status, setStatus] = useState<MiniCpmStatus>('idle');
  const [lines, setLines] = useState<MiniCpmTranscriptLine[]>(() => initialLines(sessionMode));
  const [inputLevel, setInputLevel] = useState(0.35);
  const [config, setConfig] = useState<MiniCpmConfig | null>(null);
  const [debugEntries, setDebugEntries] = useState<MiniCpmDebugEntry[]>([]);
  const sessionRef = useRef<MiniCpmRealtimeSession | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  const appendDebugEntry = useCallback((label: string, payload: unknown) => {
    setDebugEntries(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        payload,
      },
    ]);
  }, []);

  useEffect(() => {
    if (status === 'idle') {
      setLines(initialLines(sessionMode));
      setInputLevel(0.35);
    }
  }, [sessionMode, status]);

  const attachVideoElement = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element;
  }, []);

  const appendAssistantText = useCallback((text: string) => {
    setLines(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            text: `${last.text}${text}`,
          },
        ];
      }
      return [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text,
        },
      ];
    });
  }, []);

  const appendErrorLine = useCallback((text: string) => {
    setLines(prev => [
      ...prev,
      {
        id: `error-${Date.now()}`,
        role: 'error',
        text,
      },
    ]);
  }, []);

  const stop = useCallback(async () => {
    sessionRef.current?.stop(true);
    sessionRef.current = null;
    setStatus('idle');
    setInputLevel(0.35);
  }, []);

  const start = useCallback(async () => {
    await stop();
    setStatus('connecting');
    setDebugEntries([]);
    setLines([
      {
        id: 'loading',
        role: 'system',
        text: '正在连接 MiniCPM realtime demo 通道。',
      },
    ]);

    try {
      const { apiBase } = getBackendConfig();
      const nextConfig = await fetchMiniCpmConfig(apiBase);
      const wsUrl = buildMiniCpmWebSocketUrl(apiBase, nextConfig.websocket_path, sessionMode);
      setConfig(nextConfig);
      appendDebugEntry('GET /voice/minicpm/config', nextConfig);
      appendDebugEntry('MiniCPM websocket url', { wsUrl, mode: sessionMode });

      const session = new MiniCpmRealtimeSession({
        wsUrl,
        mode: sessionMode,
        videoElement: videoElementRef.current,
        onStatus: (nextStatus, detail) => {
          setStatus(mapRealtimeStatus(nextStatus));
          if (detail) appendDebugEntry('MiniCPM status detail', { status: nextStatus, detail });
        },
        onAssistantText: appendAssistantText,
        onAssistantDone: () => {
          appendDebugEntry('MiniCPM response done', { at: new Date().toISOString() });
        },
        onInputLevel: setInputLevel,
        onDebug: appendDebugEntry,
        onError: appendErrorLine,
      });
      sessionRef.current = session;
      session.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus('error');
      appendDebugEntry('MiniCPM start error', { message });
      appendErrorLine(`无法启动 MiniCPM：${message}`);
    }
  }, [appendAssistantText, appendDebugEntry, appendErrorLine, sessionMode, stop]);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop(true);
      sessionRef.current = null;
    };
  }, []);

  return {
    attachVideoElement,
    config,
    debugEntries,
    inputLevel,
    isActive: status !== 'idle' && status !== 'error',
    lines,
    sessionMode,
    start,
    status,
    stop,
  };
}
