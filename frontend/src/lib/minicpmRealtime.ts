import { base64ToFloat32, float32ToBase64 } from './minicpmClient';

export const MINICPM_INPUT_SAMPLE_RATE = 16000;
export const MINICPM_OUTPUT_SAMPLE_RATE = 24000;
export const MINICPM_MAX_BUFFERED_BYTES = 1_000_000;
export const MINICPM_VIDEO_FPS = 1;

export type MiniCpmRealtimeMode = 'audio' | 'video';
export type MiniCpmRealtimeStatus =
  | 'connecting'
  | 'queued'
  | 'listening'
  | 'speaking'
  | 'error'
  | 'closed';

export interface MiniCpmInputAppendOptions {
  audioBase64: string;
  forceListen?: boolean;
  videoFrames?: string[];
}

export interface MiniCpmOutputDelta {
  kind?: string;
  text?: string;
  audio?: string;
}

export interface MiniCpmRealtimeSessionOptions {
  wsUrl: string;
  mode: MiniCpmRealtimeMode;
  videoElement?: HTMLVideoElement | null;
  onStatus?: (status: MiniCpmRealtimeStatus, detail?: string) => void;
  onAssistantText?: (text: string) => void;
  onAssistantDone?: () => void;
  onInputLevel?: (level: number) => void;
  onDebug?: (label: string, payload: unknown) => void;
  onError?: (message: string) => void;
}

export function buildMiniCpmInputAppendMessage({
  audioBase64,
  forceListen = false,
  videoFrames,
}: MiniCpmInputAppendOptions): object {
  const input: Record<string, unknown> = {
    audio: audioBase64,
    force_listen: forceListen,
  };
  if (videoFrames?.length) {
    input.video_frames = videoFrames;
  }
  return {
    type: 'input.append',
    input,
  };
}

export function extractMiniCpmOutputDelta(message: unknown): MiniCpmOutputDelta {
  if (!message || typeof message !== 'object') return {};
  const body = message as Record<string, any>;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  return {
    kind: body.kind || payload.kind,
    text: body.text ?? body.delta ?? payload.text ?? payload.delta,
    audio: body.audio ?? body.data ?? payload.audio ?? payload.data,
  };
}

export function shouldAttachVideoFrame(
  nowMs: number,
  lastFrameMs: number,
  fps: number = MINICPM_VIDEO_FPS
): boolean {
  return nowMs - lastFrameMs >= 1000 / Math.max(fps, 0.001);
}

export function resampleFloat32(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
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

export class MiniCpmRealtimeSession {
  private ws: WebSocket | null = null;
  private ready = false;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextPlayTime = 0;
  private canvas: HTMLCanvasElement | null = null;
  private lastVideoFrameMs = 0;

  constructor(private readonly options: MiniCpmRealtimeSessionOptions) {}

  start(): void {
    this.options.onStatus?.('connecting');
    this.ws = new WebSocket(this.options.wsUrl);
    this.ws.addEventListener('open', () => {
      this.options.onDebug?.('MiniCPM websocket open', { url: this.options.wsUrl });
    });
    this.ws.addEventListener('message', event => this.handleServerMessage(event));
    this.ws.addEventListener('error', () => {
      this.options.onStatus?.('error', 'MiniCPM WebSocket error');
      this.options.onError?.('MiniCPM WebSocket error');
    });
    this.ws.addEventListener('close', () => this.stop(false));
  }

  stop(closeSocket = true): void {
    this.ready = false;
    this.options.onStatus?.('closed');
    this.nextPlayTime = 0;

    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.options.videoElement) {
      this.options.videoElement.srcObject = null;
    }
    if (closeSocket && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'proxy.close' }));
      this.ws.close();
    }
    this.ws = null;
  }

  private async startMedia(): Promise<void> {
    if (this.stream) return;

    this.audioContext = this.audioContext || new AudioContext();
    await this.audioContext.resume();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: this.options.mode === 'video',
    });

    if (this.options.videoElement && this.options.mode === 'video') {
      this.options.videoElement.srcObject = this.stream;
      this.options.videoElement.muted = true;
      this.options.videoElement.playsInline = true;
      await this.options.videoElement.play().catch(() => undefined);
    }

    this.micSource = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = event => this.handleAudioProcess(event);
    this.micSource.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    event.outputBuffer.getChannelData(0).fill(0);
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.audioContext) {
      return;
    }
    if (this.ws.bufferedAmount > MINICPM_MAX_BUFFERED_BYTES) return;

    const input = event.inputBuffer.getChannelData(0);
    this.options.onInputLevel?.(inputLevel(input));
    const pcm16k = resampleFloat32(
      input,
      this.audioContext.sampleRate,
      MINICPM_INPUT_SAMPLE_RATE
    );
    const videoFrame = this.captureVideoFrame();
    this.ws.send(
      JSON.stringify(
        buildMiniCpmInputAppendMessage({
          audioBase64: float32ToBase64(pcm16k),
          videoFrames: videoFrame ? [videoFrame] : undefined,
        })
      )
    );
  }

  private handleServerMessage(event: MessageEvent): void {
    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    this.options.onDebug?.('MiniCPM websocket message', message);

    if (message.type === 'proxy.ready') {
      this.ready = true;
      this.options.onStatus?.('listening');
      this.startMedia().catch(error => {
        const detail = error instanceof Error ? error.message : String(error);
        this.options.onStatus?.('error', detail);
        this.options.onError?.(`无法打开麦克风或摄像头：${detail}`);
        this.stop(true);
      });
      return;
    }

    if (message.type === 'proxy.error') {
      const detail = message.detail || message.message || 'MiniCPM proxy error';
      this.options.onStatus?.('error', detail);
      this.options.onError?.(detail);
      return;
    }

    if (message.type === 'session.queued') {
      this.options.onStatus?.('queued');
      return;
    }

    if (message.type === 'response.output.delta') {
      const delta = extractMiniCpmOutputDelta(message);
      if (delta.kind === 'listen') {
        this.options.onStatus?.('listening');
        return;
      }
      if (delta.kind === 'text' && delta.text) {
        this.options.onStatus?.('speaking');
        this.options.onAssistantText?.(delta.text);
      }
      if (delta.kind === 'audio' && delta.audio) {
        this.playAudioChunk(delta.audio);
      }
      return;
    }

    if (message.type === 'response.done') {
      this.options.onAssistantDone?.();
    }
  }

  private playAudioChunk(base64Audio: string): void {
    if (!this.audioContext) return;
    const pcm = base64ToFloat32(base64Audio);
    if (!pcm.length) return;

    const buffer = this.audioContext.createBuffer(1, pcm.length, MINICPM_OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(pcm, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    if (this.nextPlayTime < now) this.nextPlayTime = now + 0.03;
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
  }

  private captureVideoFrame(): string | null {
    if (this.options.mode !== 'video' || !this.options.videoElement) return null;
    const now = Date.now();
    if (!shouldAttachVideoFrame(now, this.lastVideoFrameMs, MINICPM_VIDEO_FPS)) return null;
    const video = this.options.videoElement;
    if (!video.videoWidth || !video.videoHeight) return null;

    this.canvas = this.canvas || document.createElement('canvas');
    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    const context = this.canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    this.lastVideoFrameMs = now;
    return this.canvas.toDataURL('image/jpeg', 0.82).split(',', 2)[1] || null;
  }
}

function inputLevel(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / Math.max(samples.length, 1));
  return Math.min(1.2, 0.35 + rms * 10);
}
