import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getBackendConfig } from '../lib/backendClient';
import {
  base64ToFloat32,
  buildMiniCpmWebSocketUrl,
  fetchMiniCpmConfig,
  float32ToBase64,
  MiniCpmConfig,
  MiniCpmEmotionStatus,
  MiniCpmLocalAgentStatus,
} from '../lib/minicpmClient';
import {
  ConversationTranscriptLine,
  MiniCpmSessionSnapshot,
  RecordedEmotionSample,
} from '../types';

export type MiniCpmSessionMode = 'audio' | 'video';

export interface MiniCpmTranscriptLine {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'error';
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

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const AUDIO_CHUNK_SIZE = 4096;
const MINICPM_AUDIO_CHUNK_SECONDS = 0.24;
const MINICPM_AUDIO_CHUNK_SAMPLES = Math.round(INPUT_SAMPLE_RATE * MINICPM_AUDIO_CHUNK_SECONDS);
const MAX_MINICPM_AUDIO_BUFFER_SAMPLES = INPUT_SAMPLE_RATE * 2;
const MAX_BUFFERED_BYTES = 1_000_000;
const EMOTION_INTERVAL_MS = 3000;
const EMOTION_SEGMENT_SECONDS = 3;
const MAX_EMOTION_SECONDS = 10;
const VIDEO_FRAME_INTERVAL_MS = 1000;
const ASSISTANT_LINE_SETTLE_MS = 1800;
const LISTEN_STATUS_DELAY_MS = 700;

function initialLines(mode: MiniCpmSessionMode): MiniCpmTranscriptLine[] {
  return [
    {
      id: 'intro',
      role: 'system',
      text:
        mode === 'video'
          ? '视频会话待机：MiniCPM 实时对话，浏览器会采集麦克风和摄像头做情绪识别。'
          : '语音会话待机：MiniCPM 实时对话，浏览器会采集麦克风做语音情绪识别。',
    },
  ];
}

function makeDebugEntry(label: string, payload: unknown): MiniCpmDebugEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    payload,
  };
}

export function useMiniCpmVoice(sessionMode: MiniCpmSessionMode) {
  const [status, setStatus] = useState<MiniCpmStatus>('idle');
  const [lines, setLines] = useState<MiniCpmTranscriptLine[]>(() => initialLines(sessionMode));
  const [inputLevel, setInputLevel] = useState(0.35);
  const [config, setConfig] = useState<MiniCpmConfig | null>(null);
  const [agentCommand, setAgentCommand] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<MiniCpmLocalAgentStatus | null>(null);
  const [emotionStatus, setEmotionStatus] = useState<MiniCpmEmotionStatus | null>(null);
  const [faceEmotionIssue, setFaceEmotionIssue] = useState<string | null>(null);
  const [debugEntries, setDebugEntries] = useState<MiniCpmDebugEntry[]>([]);
  const [transcriptLines, setTranscriptLines] = useState<ConversationTranscriptLine[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const linesRef = useRef<MiniCpmTranscriptLine[]>(initialLines(sessionMode));
  const emotionStatusRef = useRef<MiniCpmEmotionStatus | null>(null);
  const sessionStartedAtRef = useRef<string | null>(null);
  const transcriptRef = useRef<ConversationTranscriptLine[]>([]);
  const emotionSamplesRef = useRef<RecordedEmotionSample[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRecognitionActiveRef = useRef(false);
  const emotionTimerRef = useRef<number | null>(null);
  const emotionRequestInFlightRef = useRef(false);
  const videoFrameTimerRef = useRef<number | null>(null);
  const assistantLineSettleTimerRef = useRef<number | null>(null);
  const listenStatusTimerRef = useRef<number | null>(null);
  const currentAssistantLineIdRef = useRef<string | null>(null);
  const currentAssistantAudioPlaceholderRef = useRef(false);
  const currentUserLineIdRef = useRef<string | null>(null);
  const nextPlayTimeRef = useRef(0);
  const pendingPlaybackChunksRef = useRef(0);
  const readyRef = useRef(false);
  const effectiveModeRef = useRef<MiniCpmSessionMode>(sessionMode);
  const apiBaseRef = useRef<string>('');
  const minicpmAudioChunksRef = useRef<Float32Array[]>([]);
  const minicpmAudioSampleCountRef = useRef(0);
  const emotionChunksRef = useRef<Float32Array[]>([]);
  const emotionSampleCountRef = useRef(0);
  const latestVideoFrameBase64Ref = useRef<string | null>(null);
  const lastMiniCpmVideoFrameAtRef = useRef(0);
  const lastEmotionErrorRef = useRef<string | null>(null);
  const statsRef = useRef({
    audio_chunks_sent: 0,
    video_frames_sent: 0,
    emotion_requests_sent: 0,
    emotion_errors: [] as string[],
  });

  const appendDebugEntry = useCallback((label: string, payload: unknown) => {
    setDebugEntries(prev => [...prev, makeDebugEntry(label, payload)]);
  }, []);

  const refreshAgentStatus = useCallback((patch: Partial<MiniCpmLocalAgentStatus> = {}) => {
    setAgentStatus({
      ok: true,
      running: readyRef.current || status !== 'idle',
      mode: effectiveModeRef.current,
      minicpm_connection: 'server_proxy',
      camera: effectiveModeRef.current === 'video' ? 0 : null,
      emotion_sampling: true,
      emotion_modalities: effectiveModeRef.current === 'video' ? ['audio', 'face'] : ['audio'],
      audio_chunks_sent: statsRef.current.audio_chunks_sent,
      video_frames_sent: statsRef.current.video_frames_sent,
      emotion_requests_sent: statsRef.current.emotion_requests_sent,
      emotion_errors: statsRef.current.emotion_errors,
      last_emotion_response: emotionStatus,
      cpm_messages: lines
        .filter(line => line.role === 'assistant')
        .map(line => ({ id: line.id, role: 'assistant', text: line.text, complete: true })),
      errors: [],
      ...patch,
    });
  }, [emotionStatus, lines, status]);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    emotionStatusRef.current = emotionStatus;
  }, [emotionStatus]);

  useEffect(() => {
    if (status === 'idle') {
      setLines(initialLines(sessionMode));
      setAgentStatus(null);
      setEmotionStatus(null);
      setFaceEmotionIssue(null);
      setInputLevel(0.35);
    }
  }, [sessionMode, status]);

  useEffect(() => {
    refreshAgentStatus();
  }, [emotionStatus, lines, refreshAgentStatus]);

  const resetAssistantLine = useCallback(() => {
    if (assistantLineSettleTimerRef.current !== null) {
      window.clearTimeout(assistantLineSettleTimerRef.current);
      assistantLineSettleTimerRef.current = null;
    }
    if (listenStatusTimerRef.current !== null) {
      window.clearTimeout(listenStatusTimerRef.current);
      listenStatusTimerRef.current = null;
    }
    currentAssistantLineIdRef.current = null;
    currentAssistantAudioPlaceholderRef.current = false;
  }, []);

  const resetUserLine = useCallback(() => {
    currentUserLineIdRef.current = null;
  }, []);

  const scheduleListeningStatus = useCallback((delay = LISTEN_STATUS_DELAY_MS) => {
    if (listenStatusTimerRef.current !== null) {
      window.clearTimeout(listenStatusTimerRef.current);
    }
    listenStatusTimerRef.current = window.setTimeout(() => {
      listenStatusTimerRef.current = null;
      if (!readyRef.current) return;
      if (pendingPlaybackChunksRef.current > 0) {
        scheduleListeningStatus(delay);
        return;
      }
      setStatus('listening');
    }, delay);
  }, []);

  const settleAssistantLineSoon = useCallback(() => {
    if (!currentAssistantLineIdRef.current) return;
    if (assistantLineSettleTimerRef.current !== null) {
      window.clearTimeout(assistantLineSettleTimerRef.current);
    }
    assistantLineSettleTimerRef.current = window.setTimeout(() => {
      currentAssistantLineIdRef.current = null;
      assistantLineSettleTimerRef.current = null;
    }, ASSISTANT_LINE_SETTLE_MS);
  }, []);

  const markSpeaking = useCallback(() => {
    if (listenStatusTimerRef.current !== null) {
      window.clearTimeout(listenStatusTimerRef.current);
      listenStatusTimerRef.current = null;
    }
    setStatus('speaking');
  }, []);

  const appendLine = useCallback((role: MiniCpmTranscriptLine['role'], text: string) => {
    const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const transcriptLine = {
      id,
      role,
      text,
      created_at: new Date().toISOString(),
    };
    setLines(prev => [
      ...prev,
      {
        id,
        role,
        text,
      },
    ]);
    transcriptRef.current = [...transcriptRef.current, transcriptLine];
    setTranscriptLines([...transcriptRef.current]);
  }, []);

  const appendAssistantText = useCallback((text: string) => {
    if (!text) return;
    if (assistantLineSettleTimerRef.current !== null) {
      window.clearTimeout(assistantLineSettleTimerRef.current);
      assistantLineSettleTimerRef.current = null;
    }

    const currentId = currentAssistantLineIdRef.current;
    if (currentId) {
      const shouldReplace = currentAssistantAudioPlaceholderRef.current;
      currentAssistantAudioPlaceholderRef.current = false;
      transcriptRef.current = transcriptRef.current.map(line =>
        line.id === currentId
          ? {
              ...line,
              text: shouldReplace ? text : `${line.text}${text}`,
            }
          : line
      );
      setTranscriptLines([...transcriptRef.current]);
      setLines(prev => prev.map(line =>
        line.id === currentId
          ? { ...line, text: shouldReplace ? text : `${line.text}${text}` }
          : line
      ));
      return;
    }

    const nextLine = {
      id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant' as const,
      text,
    };
    currentAssistantLineIdRef.current = nextLine.id;
    currentAssistantAudioPlaceholderRef.current = false;
    transcriptRef.current = [
      ...transcriptRef.current,
      {
        ...nextLine,
        created_at: new Date().toISOString(),
      },
    ];
    setTranscriptLines([...transcriptRef.current]);
    setLines(prev => [...prev, nextLine]);
  }, []);

  const appendUserText = useCallback((text: string, isFinal = true) => {
    const normalizedText = text.trim();
    if (!normalizedText) return;
    currentAssistantLineIdRef.current = null;
    currentAssistantAudioPlaceholderRef.current = false;

    const currentId = currentUserLineIdRef.current;
    if (currentId) {
      transcriptRef.current = transcriptRef.current.map(line =>
        line.id === currentId ? { ...line, text: normalizedText } : line
      );
      setTranscriptLines([...transcriptRef.current]);
      setLines(prev => prev.map(line =>
        line.id === currentId ? { ...line, text: normalizedText } : line
      ));
      if (isFinal) {
        currentUserLineIdRef.current = null;
      }
      return;
    }

    const nextLine = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user' as const,
      text: normalizedText,
    };
    currentUserLineIdRef.current = isFinal ? null : nextLine.id;
    transcriptRef.current = [
      ...transcriptRef.current,
      {
        ...nextLine,
        created_at: new Date().toISOString(),
      },
    ];
    setTranscriptLines([...transcriptRef.current]);
    setLines(prev => [...prev, nextLine]);
  }, []);

  const appendAssistantAudioPlaceholder = useCallback(() => {
    if (currentAssistantLineIdRef.current) return;
    const nextLine = {
      id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant' as const,
      text: 'MiniCPM 正在语音回复，本轮未返回可显示文本。',
    };
    currentAssistantLineIdRef.current = nextLine.id;
    currentAssistantAudioPlaceholderRef.current = true;
    setLines(prev => [...prev, nextLine]);
    transcriptRef.current = [
      ...transcriptRef.current,
      {
        ...nextLine,
        created_at: new Date().toISOString(),
      },
    ];
    setTranscriptLines([...transcriptRef.current]);
  }, []);

  const stop = useCallback(async (_closeMedia = true, captureSnapshot = false) => {
    const snapshot = captureSnapshot ? buildSessionSnapshot() : null;
    readyRef.current = false;
    setStatus('idle');
    setInputLevel(0.35);
    resetAssistantLine();
    nextPlayTimeRef.current = 0;
    pendingPlaybackChunksRef.current = 0;
    latestVideoFrameBase64Ref.current = null;
    lastMiniCpmVideoFrameAtRef.current = 0;
    lastEmotionErrorRef.current = null;

    if (emotionTimerRef.current !== null) {
      window.clearInterval(emotionTimerRef.current);
      emotionTimerRef.current = null;
    }
    if (videoFrameTimerRef.current !== null) {
      window.clearInterval(videoFrameTimerRef.current);
      videoFrameTimerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    stopSpeechRecognition();
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'proxy.close' }));
      wsRef.current.close();
    }
    wsRef.current = null;
    emotionChunksRef.current = [];
    emotionSampleCountRef.current = 0;
    emotionRequestInFlightRef.current = false;
    resetMiniCpmAudioBuffer();
    statsRef.current = {
      audio_chunks_sent: 0,
      video_frames_sent: 0,
      emotion_requests_sent: 0,
      emotion_errors: [],
    };
    setAgentCommand(null);
    setAgentStatus(null);
    setEmotionStatus(null);
    emotionStatusRef.current = null;
    setFaceEmotionIssue(null);
    sessionStartedAtRef.current = null;
    transcriptRef.current = [];
    setTranscriptLines([]);
    emotionSamplesRef.current = [];
    resetUserLine();
    return snapshot;
  }, [resetAssistantLine, resetUserLine]);

  const handleMiniCpmMessage = useCallback((event: MessageEvent<string>) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === 'proxy.ready') {
      readyRef.current = true;
      setStatus('listening');
      appendLine('system', 'MiniCPM 已连接，可以开始说话。');
      appendDebugEntry('MiniCPM ready', { mode: effectiveModeRef.current });
      refreshAgentStatus({ running: true });
      return;
    }

    if (message.type === 'proxy.error') {
      const detail = String(message.detail || message.message || 'MiniCPM 代理出错。');
      appendLine('error', detail);
      setStatus('error');
      refreshAgentStatus({ ok: false, errors: [detail] });
      return;
    }

    if (message.type === 'session.queued') {
      setStatus('queued');
      return;
    }

    if (message.type === 'response.output.delta') {
      const payload = asRecord(message.payload);
      const kind = String(message.kind || payload.kind || '');
      const text = extractMiniCpmText(message);
      const audio = message.audio ?? message.data ?? payload.audio ?? payload.data;

      if (kind === 'listen') {
        settleAssistantLineSoon();
        scheduleListeningStatus();
        return;
      }

      if (text) {
        markSpeaking();
        appendAssistantText(String(text));
      }

      if (kind === 'audio' && audio) {
        markSpeaking();
        if (!text) {
          appendAssistantAudioPlaceholder();
        }
        playAudioChunk(
          String(audio),
          audioContextRef.current,
          pendingPlaybackChunksRef,
          nextPlayTimeRef,
          scheduleListeningStatus
        );
      }
      return;
    }

    if (isMiniCpmTextEvent(message)) {
      const text = extractMiniCpmText(message);
      if (text) {
        markSpeaking();
        appendAssistantText(text);
      }
      return;
    }

    if (message.type === 'response.done') {
      settleAssistantLineSoon();
      scheduleListeningStatus();
    }
  }, [
    appendAssistantText,
    appendAssistantAudioPlaceholder,
    appendDebugEntry,
    appendLine,
    markSpeaking,
    refreshAgentStatus,
    scheduleListeningStatus,
    settleAssistantLineSoon,
  ]);

  const start = useCallback(async () => {
    await stop();
    setStatus('connecting');
    setDebugEntries([]);
    setAgentCommand(null);
    sessionStartedAtRef.current = new Date().toISOString();
    transcriptRef.current = [];
    setTranscriptLines([]);
    emotionSamplesRef.current = [];
    currentAssistantAudioPlaceholderRef.current = false;
    const loadingLine: MiniCpmTranscriptLine = {
      id: 'loading',
      role: 'system',
      text: sessionMode === 'video'
        ? '正在打开摄像头和麦克风，并连接 MiniCPM。'
        : '正在打开麦克风，并连接 MiniCPM。',
    };
    transcriptRef.current = [
      {
        ...loadingLine,
        created_at: sessionStartedAtRef.current,
      },
    ];
    setTranscriptLines([...transcriptRef.current]);
    setLines([
      loadingLine,
    ]);

    try {
      const { apiBase } = getBackendConfig();
      apiBaseRef.current = apiBase;
      const nextConfig = await fetchMiniCpmConfig(apiBase);
      setConfig(nextConfig);
      appendDebugEntry('GET /voice/minicpm/config', nextConfig);

      const mediaStream = await startBrowserMedia(sessionMode);
      mediaStreamRef.current = mediaStream;
      effectiveModeRef.current = sessionMode;

      if (sessionMode === 'video' && videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => undefined);
        startVideoFrameLoop();
      }

      await startAudioCapture(mediaStream);
      startSpeechRecognition();
      startEmotionLoop();

      const wsUrl = buildMiniCpmWebSocketUrl(apiBase, nextConfig.websocket_path, sessionMode);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      appendDebugEntry('MiniCPM WebSocket', { ws_url: wsUrl, mode: sessionMode });
      ws.addEventListener('open', () => setStatus('connecting'));
      ws.addEventListener('message', handleMiniCpmMessage);
      ws.addEventListener('error', () => {
        appendLine('error', 'MiniCPM WebSocket 连接出错。');
        setStatus('error');
      });
      ws.addEventListener('close', () => {
        if (readyRef.current) void stop();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendDebugEntry('MiniCPM start error', { message });
      appendLine('error', `启动失败：${message}`);
      setStatus('error');
    }
  }, [appendDebugEntry, appendLine, handleMiniCpmMessage, sessionMode, stop]);

  const startBrowserMedia = useCallback(async (mode: MiniCpmSessionMode) => {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        mode === 'video'
          ? {
              width: { ideal: 960 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
    });
  }, []);

  const startAudioCapture = useCallback(async (stream: MediaStream) => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const audioContext = audioContextRef.current || new AudioContextConstructor();
    audioContextRef.current = audioContext;
    await audioContext.resume();

    const micSource = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);
    micSourceRef.current = micSource;
    processorRef.current = processor;

    processor.onaudioprocess = event => {
      event.outputBuffer.getChannelData(0).fill(0);
      const input = event.inputBuffer.getChannelData(0);
      updateInputLevel(input, setInputLevel);

      const pcm16k = resampleFloat32(input, audioContext.sampleRate, INPUT_SAMPLE_RATE);
      appendEmotionSamples(pcm16k);

      const ws = wsRef.current;
      if (!readyRef.current || !ws || ws.readyState !== WebSocket.OPEN) {
        resetMiniCpmAudioBuffer();
        return;
      }
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        resetMiniCpmAudioBuffer();
        return;
      }

      appendMiniCpmAudioSamples(pcm16k);
      let sentCount = 0;
      while (
        minicpmAudioSampleCountRef.current >= MINICPM_AUDIO_CHUNK_SAMPLES &&
        ws.bufferedAmount <= MAX_BUFFERED_BYTES
      ) {
        const audioChunk = drainMiniCpmAudioSamples(MINICPM_AUDIO_CHUNK_SAMPLES);
        const inputPayload: {
          audio: string;
          force_listen: boolean;
          video_frames?: string[];
        } = {
          audio: float32ToBase64(audioChunk),
          force_listen: false,
        };

        const now = Date.now();
        if (
          effectiveModeRef.current === 'video' &&
          latestVideoFrameBase64Ref.current &&
          now - lastMiniCpmVideoFrameAtRef.current >= VIDEO_FRAME_INTERVAL_MS
        ) {
          inputPayload.video_frames = [latestVideoFrameBase64Ref.current];
          lastMiniCpmVideoFrameAtRef.current = now;
          statsRef.current.video_frames_sent += 1;
        }

        ws.send(JSON.stringify({ type: 'input.append', input: inputPayload }));
        statsRef.current.audio_chunks_sent += 1;
        sentCount += 1;
      }

      if (sentCount > 0) {
        refreshAgentStatus();
      }
    };

    micSource.connect(processor);
    processor.connect(audioContext.destination);
  }, [refreshAgentStatus]);

  const startVideoFrameLoop = useCallback(() => {
    if (videoFrameTimerRef.current !== null) {
      window.clearInterval(videoFrameTimerRef.current);
    }
    videoFrameTimerRef.current = window.setInterval(async () => {
      latestVideoFrameBase64Ref.current = await captureJpegBase64(videoRef.current);
    }, VIDEO_FRAME_INTERVAL_MS);
  }, []);

  const startEmotionLoop = useCallback(() => {
    if (emotionTimerRef.current !== null) {
      window.clearInterval(emotionTimerRef.current);
    }
    emotionTimerRef.current = window.setInterval(() => {
      if (emotionRequestInFlightRef.current) return;
      emotionRequestInFlightRef.current = true;
      postEmotionSample()
        .catch(error => {
          const message = `情绪识别失败：${error instanceof Error ? error.message : String(error)}`;
          if (message !== lastEmotionErrorRef.current) {
            appendLine('error', message);
            lastEmotionErrorRef.current = message;
          }
          statsRef.current.emotion_errors = [...statsRef.current.emotion_errors, message].slice(-5);
        })
        .finally(() => {
          emotionRequestInFlightRef.current = false;
          refreshAgentStatus();
        });
    }, EMOTION_INTERVAL_MS);
  }, [appendLine, refreshAgentStatus]);

  const postEmotionSample = useCallback(async () => {
    const samplesNeeded = INPUT_SAMPLE_RATE * EMOTION_SEGMENT_SECONDS;
    if (emotionSampleCountRef.current < samplesNeeded * 0.8) return;

    const audioSamples = getRecentEmotionSamples(samplesNeeded);
    const audioBlob = makeWavBlob(audioSamples, INPUT_SAMPLE_RATE);
    const imageBlob =
      effectiveModeRef.current === 'video'
        ? await captureJpegBlob(videoRef.current)
        : null;

    let body: MiniCpmEmotionStatus;
    let imageErrorMessage: string | null = null;
    try {
      body = await sendCompanionEmotionRequest(apiBaseRef.current, audioBlob, imageBlob);
    } catch (error) {
      if (!imageBlob) throw error;
      imageErrorMessage = describeImageEmotionError(error);
      appendDebugEntry('Face emotion request failed', {
        message: imageErrorMessage,
        error: serializeError(error),
      });
      statsRef.current.emotion_errors = [
        ...statsRef.current.emotion_errors,
        imageErrorMessage,
      ].slice(-5);
      body = await sendCompanionEmotionRequest(apiBaseRef.current, audioBlob, null);
    }

    statsRef.current.emotion_requests_sent += 1;
    lastEmotionErrorRef.current = null;
    recordEmotionSamples(body);
    if (effectiveModeRef.current === 'video') {
      if (body.face_emotion?.label) {
        setFaceEmotionIssue(null);
      } else {
        setFaceEmotionIssue(
          imageErrorMessage ||
            (imageBlob ? '图片已上传，但后端未返回面部结果' : '摄像头画面尚未就绪')
        );
      }
    }
    setEmotionStatus(body);
    emotionStatusRef.current = body;
    refreshAgentStatus({ last_emotion_response: body });
  }, [appendDebugEntry, refreshAgentStatus]);

  const isActive = status !== 'idle' && status !== 'error';

  return {
    agentCommand,
    agentStatus,
    config,
    debugEntries,
    emotionStatus,
    faceEmotionIssue,
    inputLevel,
    isActive,
    lines,
    transcriptLines,
    sessionMode,
    start,
    status,
    stop,
    videoRef,
  };

  function appendEmotionSamples(samples: Float32Array) {
    if (!samples.length) return;
    emotionChunksRef.current.push(samples);
    emotionSampleCountRef.current += samples.length;
    const maxSamples = INPUT_SAMPLE_RATE * MAX_EMOTION_SECONDS;
    while (emotionSampleCountRef.current > maxSamples && emotionChunksRef.current.length) {
      const overflow = emotionSampleCountRef.current - maxSamples;
      const first = emotionChunksRef.current[0];
      if (first.length <= overflow) {
        emotionChunksRef.current.shift();
        emotionSampleCountRef.current -= first.length;
      } else {
        emotionChunksRef.current[0] = first.slice(overflow);
        emotionSampleCountRef.current -= overflow;
      }
    }
  }

  function getRecentEmotionSamples(sampleCount: number): Float32Array {
    const count = Math.min(sampleCount, emotionSampleCountRef.current);
    const output = new Float32Array(count);
    let offset = count;
    for (let i = emotionChunksRef.current.length - 1; i >= 0 && offset > 0; i -= 1) {
      const chunk = emotionChunksRef.current[i];
      const take = Math.min(chunk.length, offset);
      offset -= take;
      output.set(chunk.subarray(chunk.length - take), offset);
    }
    return output;
  }

  function resetMiniCpmAudioBuffer() {
    minicpmAudioChunksRef.current = [];
    minicpmAudioSampleCountRef.current = 0;
  }

  function appendMiniCpmAudioSamples(samples: Float32Array) {
    if (!samples.length) return;
    minicpmAudioChunksRef.current.push(samples);
    minicpmAudioSampleCountRef.current += samples.length;

    while (
      minicpmAudioSampleCountRef.current > MAX_MINICPM_AUDIO_BUFFER_SAMPLES &&
      minicpmAudioChunksRef.current.length
    ) {
      const overflow = minicpmAudioSampleCountRef.current - MAX_MINICPM_AUDIO_BUFFER_SAMPLES;
      const first = minicpmAudioChunksRef.current[0];
      if (first.length <= overflow) {
        minicpmAudioChunksRef.current.shift();
        minicpmAudioSampleCountRef.current -= first.length;
      } else {
        minicpmAudioChunksRef.current[0] = first.slice(overflow);
        minicpmAudioSampleCountRef.current -= overflow;
      }
    }
  }

  function drainMiniCpmAudioSamples(sampleCount: number): Float32Array {
    const count = Math.min(sampleCount, minicpmAudioSampleCountRef.current);
    const output = new Float32Array(count);
    let offset = 0;

    while (offset < count && minicpmAudioChunksRef.current.length) {
      const first = minicpmAudioChunksRef.current[0];
      const take = Math.min(first.length, count - offset);
      output.set(first.subarray(0, take), offset);
      offset += take;
      minicpmAudioSampleCountRef.current -= take;

      if (take === first.length) {
        minicpmAudioChunksRef.current.shift();
      } else {
        minicpmAudioChunksRef.current[0] = first.slice(take);
      }
    }

    return output;
  }

  function startSpeechRecognition() {
    const SpeechRecognitionConstructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) return;

    stopSpeechRecognition();
    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      speechRecognitionRef.current = recognition;
      speechRecognitionActiveRef.current = true;

      recognition.onresult = event => {
        if (pendingPlaybackChunksRef.current > 0) return;
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript?.trim() || '';
          if (!text) continue;
          if (result.isFinal) {
            appendUserText(text, true);
          } else {
            interimText = `${interimText}${text}`;
          }
        }
        if (interimText.trim()) {
          appendUserText(interimText, false);
        }
      };
      recognition.onerror = () => {
        resetUserLine();
      };
      recognition.onend = () => {
        if (!speechRecognitionActiveRef.current || !readyRef.current) return;
        window.setTimeout(() => {
          if (!speechRecognitionActiveRef.current || !readyRef.current) return;
          try {
            speechRecognitionRef.current?.start();
          } catch {
            // The browser can throw if recognition is already starting.
          }
        }, 300);
      };
      recognition.start();
    } catch {
      speechRecognitionRef.current = null;
      speechRecognitionActiveRef.current = false;
    }
  }

  function stopSpeechRecognition() {
    speechRecognitionActiveRef.current = false;
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // Ignore browser-specific stop errors during teardown.
    }
  }

  function recordEmotionSamples(body: MiniCpmEmotionStatus) {
    const capturedAt = new Date().toISOString();
    const nextSamples: RecordedEmotionSample[] = [];
    if (body.audio_emotion?.label) {
      nextSamples.push({
        captured_at: capturedAt,
        source: 'audio',
        label: body.audio_emotion.label,
        confidence: body.audio_emotion.confidence,
      });
    }
    if (body.face_emotion?.label) {
      nextSamples.push({
        captured_at: capturedAt,
        source: 'face',
        label: body.face_emotion.label,
        confidence: body.face_emotion.confidence,
      });
    }
    if (body.fusion_emotion?.label) {
      nextSamples.push({
        captured_at: capturedAt,
        source: 'fusion',
        label: body.fusion_emotion.label,
        confidence: body.fusion_emotion.confidence,
      });
    }
    if (nextSamples.length) {
      emotionSamplesRef.current = [...emotionSamplesRef.current, ...nextSamples].slice(-120);
    }
  }

  function buildSessionSnapshot(): MiniCpmSessionSnapshot | null {
    const startedAt = sessionStartedAtRef.current;
    if (!startedAt) return null;
    const endedAt = new Date().toISOString();
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    );
    const latestEmotion = emotionStatusRef.current;
    return {
      mode: effectiveModeRef.current,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      transcript: transcriptRef.current.length
        ? transcriptRef.current
        : linesRef.current.map(line => ({
            ...line,
            created_at: endedAt,
          })),
      emotion_samples: emotionSamplesRef.current,
      latest_audio_emotion: latestEmotion?.audio_emotion || null,
      latest_face_emotion: latestEmotion?.face_emotion || null,
      latest_fusion_emotion: latestEmotion?.fusion_emotion || null,
    };
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  }
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function isMiniCpmTextEvent(message: Record<string, unknown>): boolean {
  const payload = asRecord(message.payload);
  const eventType = String(message.type || '').toLowerCase();
  const kind = String(message.kind || payload.kind || '').toLowerCase();
  return kind === 'text' || eventType.includes('text') || eventType.includes('transcript');
}

function extractMiniCpmText(message: Record<string, unknown>): string {
  const payload = asRecord(message.payload);
  const delta = asRecord(message.delta);
  const payloadDelta = asRecord(payload.delta);
  const candidates = [
    message.text,
    payload.text,
    message.transcript,
    payload.transcript,
    message.output_text,
    payload.output_text,
    typeof message.delta === 'string' ? message.delta : undefined,
    delta.text,
    delta.transcript,
    typeof payload.delta === 'string' ? payload.delta : undefined,
    payloadDelta.text,
    payloadDelta.transcript,
    collectNestedMiniCpmText(message),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return '';
}

function collectNestedMiniCpmText(value: unknown): string {
  const candidates: string[] = [];
  collectTextCandidates(value, candidates, 0, '');
  return candidates.find(candidate => candidate.trim()) || '';
}

function collectTextCandidates(
  value: unknown,
  candidates: string[],
  depth: number,
  keyName: string
) {
  if (depth > 5 || candidates.length > 8 || value == null) return;
  const key = keyName.toLowerCase();
  if (typeof value === 'string') {
    if (isTextLikeKey(key) && isDisplayableMiniCpmText(value)) {
      candidates.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectTextCandidates(item, candidates, depth + 1, keyName));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = childKey.toLowerCase();
    if (isMediaLikeKey(normalizedKey)) continue;
    collectTextCandidates(childValue, candidates, depth + 1, normalizedKey);
  }
}

function isTextLikeKey(key: string): boolean {
  return [
    'text',
    'transcript',
    'output_text',
    'content',
    'delta',
    'response',
    'message',
  ].includes(key);
}

function isMediaLikeKey(key: string): boolean {
  return key.includes('audio') || key.includes('video') || key.includes('image') || key === 'data';
}

function isDisplayableMiniCpmText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (['audio', 'text', 'listen', 'response.output.delta'].includes(trimmed.toLowerCase())) {
    return false;
  }
  if (trimmed.length > 3000) return false;
  if (/^[A-Za-z0-9+/=\s]{200,}$/.test(trimmed)) return false;
  return true;
}

function updateInputLevel(samples: Float32Array, setInputLevel: (value: number) => void) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  setInputLevel(Math.min(1.2, 0.35 + rms * 10));
}

function resampleFloat32(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return new Float32Array(input);
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let total = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      total += input[j];
      count += 1;
    }
    output[i] = count ? total / count : input[start] || 0;
  }
  return output;
}

function playAudioChunk(
  base64Audio: string,
  audioContext: AudioContext | null,
  pendingPlaybackChunksRef: MutableRefObject<number>,
  nextPlayTimeRef: MutableRefObject<number>,
  scheduleListeningStatus: (delay?: number) => void
) {
  if (!audioContext) return;
  const pcm = base64ToFloat32(base64Audio);
  if (!pcm.length) return;

  const buffer = audioContext.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
  buffer.copyToChannel(pcm, 0);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  pendingPlaybackChunksRef.current += 1;
  source.onended = () => {
    pendingPlaybackChunksRef.current = Math.max(0, pendingPlaybackChunksRef.current - 1);
    if (pendingPlaybackChunksRef.current === 0) {
      scheduleListeningStatus(300);
    }
  };

  const now = audioContext.currentTime;
  if (nextPlayTimeRef.current < now) {
    nextPlayTimeRef.current = now + 0.03;
  }
  source.start(nextPlayTimeRef.current);
  nextPlayTimeRef.current += buffer.duration;
}

class CompanionRequestError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'CompanionRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function sendCompanionEmotionRequest(
  apiBase: string,
  audioBlob: Blob,
  imageBlob: Blob | null
): Promise<MiniCpmEmotionStatus> {
  const form = new FormData();
  form.set('user_text', '请根据当前语音和画面判断我的情绪。');
  form.set('request_reply', 'false');
  form.set('audio_file', audioBlob, 'browser-audio.wav');
  if (imageBlob) {
    form.set('image_file', imageBlob, 'camera-frame.jpg');
  }

  const response = await fetch(`${apiBase.replace(/\/+$/, '')}/companion/respond`, {
    method: 'POST',
    headers: {
      'X-Client-Name': 'VocalMind',
      'X-Client-Platform': 'vocalmind-demo',
    },
    body: form,
  });

  if (!response.ok) {
    let detail = `${response.status}`;
    let code: string | undefined;
    let details: unknown;
    try {
      const errorBody = await response.json();
      code = errorBody?.error?.code;
      details = errorBody?.error?.details;
      detail = errorBody?.error?.message || errorBody?.detail || detail;
    } catch {
      detail = await response.text();
    }
    throw new CompanionRequestError(detail, response.status, code, details);
  }

  return await response.json() as MiniCpmEmotionStatus;
}

function describeImageEmotionError(error: unknown): string {
  if (error instanceof CompanionRequestError) {
    if (error.code === 'face_not_detected') return '未检测到人脸';
    if (error.code === 'model_unavailable') return '面部模型未准备好';
    if (error.code === 'image_empty') return '摄像头图片为空';
    if (error.code === 'image_unreadable' || error.code === 'image_invalid') {
      return '摄像头图片无法识别';
    }
    return error.message || `图像情绪识别失败 (${error.status})`;
  }
  return error instanceof Error ? error.message : String(error);
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof CompanionRequestError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

function makeWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const headerBytes = 44;
  const buffer = new ArrayBuffer(headerBytes + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);
  let offset = headerBytes;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

async function captureJpegBase64(video: HTMLVideoElement | null): Promise<string | null> {
  const blob = await captureJpegBlob(video);
  if (!blob) return null;
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.split(',', 2)[1] || null;
}

function captureJpegBlob(video: HTMLVideoElement | null): Promise<Blob | null> {
  if (!video?.videoWidth || !video.videoHeight) {
    return Promise.resolve(null);
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
