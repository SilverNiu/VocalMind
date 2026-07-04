import { useEffect, useRef, useCallback, useState } from 'react';
import { EmotionState, InteractionState } from '../types';
import { encodePcmChunksAsWavBase64 } from '../lib/audioUtils';
import {
  CompanionResponse,
  getBackendConfig,
  postCompanionRespond,
} from '../lib/backendClient';
import {
  attachMediaStreamToVideo,
  getMediaStartErrorMessage,
  isMediaPermissionDenied,
} from '../lib/mediaUtils';

const AUDIO_CHUNK_MS = 4000;
const AUDIO_WORKLET_MODULE_URL = '/pcm-capture-worklet.js';
const AUDIO_WORKLET_PROCESSOR_NAME = 'vocalmind-pcm-capture';
const USER_TEXT = '请根据我当前情绪给出简短陪伴回复';

type AudioContextConstructor = typeof AudioContext;
const BACKEND_CONFIG = getBackendConfig();

export function useCompanionBackend(
  isActive: boolean,
  mode: 'video' | 'audio',
  onEmotionUpdate: (emotion: EmotionState, state: InteractionState) => void
) {
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<AudioWorkletNode | null>(null);
  const audioFlushIntervalRef = useRef<number | null>(null);
  const videoFrameIntervalRef = useRef<number | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onEmotionUpdateRef = useRef(onEmotionUpdate);
  const mediaSessionRef = useRef(0);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    onEmotionUpdateRef.current = onEmotionUpdate;
  }, [onEmotionUpdate]);

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    if (node && mode === 'video' && streamRef.current) {
      void attachMediaStreamToVideo(node, streamRef.current);
    }
  }, [mode]);

  const stopAudioProcessing = useCallback(() => {
    if (audioFlushIntervalRef.current !== null) {
      window.clearInterval(audioFlushIntervalRef.current);
      audioFlushIntervalRef.current = null;
    }

    if (audioProcessorRef.current) {
      audioProcessorRef.current.port.onmessage = null;
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }

    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch((err) => {
        console.error('Failed to close audio context', err);
      });
      audioContextRef.current = null;
    }

    pcmChunksRef.current = [];
  }, []);

  const stopMediaResources = useCallback(() => {
    if (videoFrameIntervalRef.current !== null) {
      window.clearInterval(videoFrameIntervalRef.current);
      videoFrameIntervalRef.current = null;
    }

    stopAudioProcessing();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopAudioProcessing]);

  const startMedia = useCallback(async () => {
    const sessionId = ++mediaSessionRef.current;
    const isCurrentSession = () => mediaSessionRef.current === sessionId;

    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: mode === 'video',
        audio: true
      });

      const releaseStream = () => {
        stream.getTracks().forEach(track => track.stop());
        if (streamRef.current === stream) {
          streamRef.current = null;
        }
        if (videoElementRef.current?.srcObject === stream) {
          videoElementRef.current.srcObject = null;
        }
      };

      if (!isCurrentSession()) {
        releaseStream();
        return;
      }

      streamRef.current = stream;
      if (videoElementRef.current && mode === 'video') {
        await attachMediaStreamToVideo(videoElementRef.current, stream);
        if (!isCurrentSession()) {
          releaseStream();
          return;
        }
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }

      let lastReplyTime = Date.now();

      const sendDataToBackend = async (audioBase64: string) => {
        let imageBase64: string | undefined;
        if (mode === 'video' && canvasRef.current) {
          imageBase64 = canvasRef.current.toDataURL('image/jpeg', 0.8);
        }

        onEmotionUpdateRef.current(null, 'analyzing');

        const now = Date.now();
        const requestReply = now - lastReplyTime >= 10000;
        if (requestReply) {
          lastReplyTime = now;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            user_text: USER_TEXT,
            audio_base64: audioBase64,
            audio_format: 'wav',
            image_base64: imageBase64,
            request_reply: requestReply
          }));
          return;
        }

        try {
          const data = await postCompanionRespond(BACKEND_CONFIG.apiBase, {
            userText: USER_TEXT,
            audioBase64,
            audioFormat: 'wav',
            imageBase64,
          });
          handleCompanionResponse(data, onEmotionUpdateRef.current);
        } catch (err) {
          onEmotionUpdateRef.current(null, 'listening');
          console.error('HTTP companion request failed', err);
        }
      };

      if (BACKEND_CONFIG.wsUrl) {
        wsRef.current = new WebSocket(BACKEND_CONFIG.wsUrl);
        wsRef.current.onopen = () => {
          console.log('WS connected');
          onEmotionUpdateRef.current(null, 'listening');
        };

        wsRef.current.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            handleCompanionResponse(data, onEmotionUpdateRef.current);
          } catch (err) {
            console.error('Failed to parse WS message', err);
          }
        };

        wsRef.current.onerror = () => {
          console.warn('WebSocket unavailable; using HTTP companion fallback.');
        };
      } else {
        onEmotionUpdateRef.current(null, 'listening');
      }

      const AudioContextClass = getAudioContextConstructor();
      const audioCtx = new AudioContextClass();
      if (!isCurrentSession()) {
        releaseStream();
        void audioCtx.close().catch((err) => {
          console.error('Failed to close stale audio context', err);
        });
        return;
      }
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        if (!isCurrentSession()) {
          releaseStream();
          if (audioContextRef.current === audioCtx) {
            audioContextRef.current = null;
          }
          void audioCtx.close().catch((err) => {
            console.error('Failed to close stale audio context', err);
          });
          return;
        }
      }

      const audioStream = new MediaStream(stream.getAudioTracks());
      const audioSource = audioCtx.createMediaStreamSource(audioStream);
      await audioCtx.audioWorklet.addModule(AUDIO_WORKLET_MODULE_URL);
      if (!isCurrentSession()) {
        releaseStream();
        if (audioContextRef.current === audioCtx) {
          audioContextRef.current = null;
        }
        void audioCtx.close().catch((err) => {
          console.error('Failed to close stale audio context', err);
        });
        return;
      }

      const audioProcessor = new AudioWorkletNode(audioCtx, AUDIO_WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      audioProcessor.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!isCurrentSession()) return;
        const input = event.data;
        const chunk = new Float32Array(input.length);
        chunk.set(input);
        pcmChunksRef.current.push(chunk);
      };

      audioSource.connect(audioProcessor);
      audioProcessor.connect(audioCtx.destination);
      audioSourceRef.current = audioSource;
      audioProcessorRef.current = audioProcessor;

      const flushAudio = () => {
        const chunks = pcmChunksRef.current;
        if (chunks.length === 0) return;
        pcmChunksRef.current = [];

        try {
          const base64Wav = encodePcmChunksAsWavBase64(chunks, audioCtx.sampleRate);
          void sendDataToBackend(base64Wav);
        } catch (err) {
          console.error('Audio processing error', err);
        }
      };

      audioFlushIntervalRef.current = window.setInterval(flushAudio, AUDIO_CHUNK_MS);

      videoFrameIntervalRef.current = window.setInterval(() => {
        if (mode !== 'video') return;
        const video = videoElementRef.current;
        if (!video || video.readyState < 2) return;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        }
      }, 1000);
    } catch (err) {
      if (!isCurrentSession()) {
        return;
      }
      setMediaError(getMediaStartErrorMessage(err, mode));
      stopMediaResources();
      if (!isMediaPermissionDenied(err)) {
        console.error('Failed to start media', err);
      }
    }
  }, [mode, stopMediaResources]);

  useEffect(() => {
    if (isActive) {
      void startMedia();
      return () => {
        mediaSessionRef.current += 1;
        stopMediaResources();
      };
    }
  }, [isActive, startMedia, stopMediaResources]);

  return {
    setVideoRef,
    mediaError
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

function mapBackendEmotion(label: string): EmotionState {
  const l = label.toLowerCase();
  if (['happy', 'joy'].includes(l)) return 'happy';
  if (['sad', 'tired', 'disgust'].includes(l)) return 'tired';
  if (['fear', 'angry', 'anxious'].includes(l)) return 'anxious';
  return 'calm'; // neutral or default
}

function handleCompanionResponse(
  data: CompanionResponse,
  onEmotionUpdate: (emotion: EmotionState, state: InteractionState) => void
) {
  if (data.ok === false) return;

  const label = data.fusion_emotion?.label || data.audio_emotion?.label || data.face_emotion?.label;
  if (label) {
    onEmotionUpdate(mapBackendEmotion(label), 'feedback');
  }
}
