import { useCallback, useEffect, useRef, useState } from 'react';
import { resamplePcmSamples } from '../lib/audioUtils';
import { getBackendConfig } from '../lib/backendClient';
import {
  base64ToFloat32,
  buildMiniCpmWebSocketUrl,
  fetchMiniCpmConfig,
  float32ToBase64,
  MiniCpmConfig,
} from '../lib/minicpmClient';

const INPUT_WORKLET_URL = '/minicpm-input-worklet.js';
const INPUT_WORKLET_NAME = 'minicpm-input-capture';
const MAX_BUFFERED_BYTES = 1_000_000;

type AudioContextConstructor = typeof AudioContext;

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
      text: '点击开始后，说一句中文试试。',
    },
  ]);
  const [inputLevel, setInputLevel] = useState(0.35);
  const [config, setConfig] = useState<MiniCpmConfig | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputNodeRef = useRef<AudioWorkletNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const currentAssistantLineRef = useRef<string | null>(null);
  const configRef = useRef<MiniCpmConfig | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const appendLine = useCallback((role: MiniCpmTranscriptLine['role'], text: string) => {
    const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setLines(prev => [...prev, { id, role, text }]);
    return id;
  }, []);

  const appendAssistantText = useCallback((text: string) => {
    setLines(prev => {
      const existingId = currentAssistantLineRef.current;
      if (existingId) {
        return prev.map(line => (
          line.id === existingId ? { ...line, text: `${line.text}${text}` } : line
        ));
      }

      const id = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      currentAssistantLineRef.current = id;
      return [...prev, { id, role: 'assistant', text }];
    });
  }, []);

  const stop = useCallback((closeSocket = true) => {
    readyRef.current = false;
    setStatus('idle');
    setInputLevel(0.35);
    currentAssistantLineRef.current = null;
    nextPlayTimeRef.current = 0;

    if (inputNodeRef.current) {
      inputNodeRef.current.port.onmessage = null;
      inputNodeRef.current.disconnect();
      inputNodeRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (closeSocket && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'proxy.close' }));
      wsRef.current.close();
    }
    wsRef.current = null;
  }, []);

  const playAudioChunk = useCallback((base64Audio: string) => {
    const audioContext = audioContextRef.current;
    const currentConfig = configRef.current;
    if (!audioContext || !currentConfig) return;

    const pcm = base64ToFloat32(base64Audio);
    if (!pcm.length) return;

    const buffer = audioContext.createBuffer(
      currentConfig.output_audio.channels || 1,
      pcm.length,
      currentConfig.output_audio.sample_rate
    );
    buffer.copyToChannel(pcm, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const now = audioContext.currentTime;
    if (nextPlayTimeRef.current < now) {
      nextPlayTimeRef.current = now + 0.03;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  }, []);

  const startMicrophone = useCallback(async () => {
    const currentConfig = configRef.current;
    const ws = wsRef.current;
    if (!currentConfig || !ws || streamRef.current) return;

    const AudioContextClass = getAudioContextConstructor();
    const audioContext = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = audioContext;
    await audioContext.resume();
    await audioContext.audioWorklet.addModule(INPUT_WORKLET_URL);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    const source = audioContext.createMediaStreamSource(stream);
    const inputNode = new AudioWorkletNode(audioContext, INPUT_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    inputNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const input = event.data;
      setInputLevel(calculateInputLevel(input));

      const socket = wsRef.current;
      if (!readyRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;

      const pcm = resamplePcmSamples(
        input,
        audioContext.sampleRate,
        currentConfig.input_audio.sample_rate
      );
      socket.send(JSON.stringify({
        type: 'input.append',
        input: {
          audio: float32ToBase64(pcm),
          force_listen: false,
        },
      }));
    };

    source.connect(inputNode);
    inputNode.connect(audioContext.destination);
    micSourceRef.current = source;
    inputNodeRef.current = inputNode;
  }, []);

  const handleServerMessage = useCallback((event: MessageEvent<string>) => {
    let message: Record<string, any>;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === 'proxy.ready') {
      readyRef.current = true;
      setStatus('listening');
      void startMicrophone().catch((error) => {
        appendLine('error', `无法打开麦克风：${error.message || error}`);
        setStatus('error');
        stop(true);
      });
      return;
    }

    if (message.type === 'proxy.error') {
      appendLine('error', String(message.detail || message.message || 'MiniCPM 代理出错。'));
      setStatus('error');
      return;
    }

    if (message.type === 'session.queued') {
      setStatus('queued');
      return;
    }

    if (message.type === 'response.output.delta') {
      const kind = message.kind || message.payload?.kind;
      const text = message.text ?? message.delta ?? message.payload?.text ?? message.payload?.delta;
      const audio = message.audio ?? message.data ?? message.payload?.audio ?? message.payload?.data;

      if (kind === 'listen') {
        currentAssistantLineRef.current = null;
        setStatus('listening');
        return;
      }

      if (kind === 'text' && text) {
        setStatus('speaking');
        appendAssistantText(String(text));
      }

      if (kind === 'audio' && audio) {
        setStatus('speaking');
        playAudioChunk(String(audio));
      }
      return;
    }

    if (message.type === 'response.done') {
      currentAssistantLineRef.current = null;
    }
  }, [appendAssistantText, appendLine, playAudioChunk, startMicrophone, stop]);

  const start = useCallback(async () => {
    stop(true);
    setLines([{ id: 'intro', role: 'system', text: '连接后直接说话，我会实时播放 MiniCPM 的回复。' }]);
    setStatus('connecting');

    try {
      const { apiBase } = getBackendConfig();
      const nextConfig = await fetchMiniCpmConfig(apiBase);
      setConfig(nextConfig);
      configRef.current = nextConfig;

      const ws = new WebSocket(buildMiniCpmWebSocketUrl(apiBase, nextConfig.websocket_path));
      wsRef.current = ws;
      ws.addEventListener('open', () => setStatus('connecting'));
      ws.addEventListener('message', handleServerMessage);
      ws.addEventListener('error', () => {
        appendLine('error', 'WebSocket 连接出错。');
        setStatus('error');
      });
      ws.addEventListener('close', () => stop(false));
    } catch (error) {
      stop(true);
      appendLine('error', `无法连接 MiniCPM 后端：${getMiniCpmStartErrorMessage(error)}`);
      setStatus('error');
    }
  }, [appendLine, handleServerMessage, stop]);

  useEffect(() => {
    return () => {
      stop(true);
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stop]);

  return {
    config,
    inputLevel,
    isActive: status !== 'idle' && status !== 'error',
    lines,
    start,
    status,
    stop,
  };
}

function getAudioContextConstructor(): AudioContextConstructor {
  const win = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const AudioContextClass = window.AudioContext || win.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('AudioContext is not supported in this browser.');
  }
  return AudioContextClass;
}

function calculateInputLevel(samples: Float32Array): number {
  if (!samples.length) return 0.35;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1.2, 0.35 + rms * 10);
}

function getMiniCpmStartErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('502')) {
    return '配置接口返回 502，请确认 AutoDL 后端服务和 SSH 反向隧道都在运行。';
  }
  return message;
}
