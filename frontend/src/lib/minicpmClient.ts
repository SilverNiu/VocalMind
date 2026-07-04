export const MINICPM_CONFIG_PATH = '/voice/minicpm/config';

export interface MiniCpmAudioContract {
  sample_rate: number;
  channels: number;
  encoding: string;
}

export interface MiniCpmVideoContract {
  encoding: string;
  field: string;
  recommended_fps: number;
}

export interface MiniCpmLocalLauncherContract {
  base_url: string;
  start_path: string;
  health_path: string;
  stop_path: string;
  shutdown_path?: string;
  status_path?: string;
  script: string;
}

export interface MiniCpmLocalAgentContract {
  websocket_path: string;
  mode: 'audio' | 'video';
  minicpm_connection?: 'direct' | 'server_proxy';
  minicpm_realtime_url?: string;
  script: string;
  description: string;
  launcher?: MiniCpmLocalLauncherContract;
}

export interface MiniCpmConfig {
  demo_path: string;
  websocket_path: string;
  local_agent?: MiniCpmLocalAgentContract;
  input_audio: MiniCpmAudioContract;
  input_video?: MiniCpmVideoContract;
  output_audio: MiniCpmAudioContract;
  upstream_configured: boolean;
  auth_configured: boolean;
}

export function getMiniCpmConfigUrl(apiBase: string): string {
  return `${normalizeBaseUrl(apiBase)}${MINICPM_CONFIG_PATH}`;
}

export async function fetchMiniCpmConfig(
  apiBase: string,
  fetchImpl: typeof fetch = fetch
): Promise<MiniCpmConfig> {
  const response = await fetchImpl(getMiniCpmConfigUrl(apiBase), {
    headers: {
      Accept: 'application/json',
      'X-Client-Name': 'VocalMind',
      'X-Client-Platform': 'web',
    },
  });

  if (!response.ok) {
    throw new Error(`MiniCPM config request failed: ${response.status}`);
  }

  return await response.json() as MiniCpmConfig;
}

export interface MiniCpmLauncherStartPayload {
  api_base: string;
  mode: 'audio' | 'video';
  minicpm_realtime_url?: string;
}

export interface MiniCpmLauncherStartResponse {
  ok: boolean;
  started?: boolean;
  already_running?: boolean;
  pid?: number;
  project_root?: string;
  error?: string;
  message?: string;
}

export interface MiniCpmLauncherShutdownResponse {
  ok: boolean;
  shutdown?: boolean;
  error?: string;
  message?: string;
}

export interface MiniCpmTranscriptMessage {
  id: string;
  role: 'assistant' | 'system' | 'error';
  text: string;
  complete?: boolean;
}

export interface MiniCpmEmotionPrediction {
  source?: string;
  label?: string;
  confidence?: number;
  scores?: Record<string, number>;
  evidence?: Record<string, string>;
}

export interface MiniCpmEmotionStatus {
  audio_emotion?: MiniCpmEmotionPrediction | null;
  face_emotion?: MiniCpmEmotionPrediction | null;
  fusion_emotion?: MiniCpmEmotionPrediction | null;
}

export interface MiniCpmLocalAgentStatus {
  ok: boolean;
  running?: boolean;
  mode?: 'audio' | 'video';
  minicpm_connection?: 'direct' | 'server_proxy';
  camera?: number | null;
  emotion_sampling?: boolean;
  emotion_modalities?: Array<'audio' | 'face'>;
  audio_chunks_sent?: number;
  video_frames_sent?: number;
  emotion_frames_captured?: number;
  emotion_requests_sent?: number;
  emotion_errors?: string[];
  last_emotion_response?: MiniCpmEmotionStatus | null;
  cpm_messages?: MiniCpmTranscriptMessage[];
  errors?: string[];
}

export interface MiniCpmLauncherStatusResponse {
  ok: boolean;
  running: boolean;
  project_root?: string;
  status_file?: string;
  status?: MiniCpmLocalAgentStatus | null;
  error?: string;
  message?: string;
}

export function getMiniCpmLauncherStartUrl(launcher: MiniCpmLocalLauncherContract): string {
  return `${normalizeBaseUrl(launcher.base_url)}${launcher.start_path}`;
}

export function getMiniCpmLauncherShutdownUrl(launcher: MiniCpmLocalLauncherContract): string {
  return `${normalizeBaseUrl(launcher.base_url)}${launcher.shutdown_path || launcher.stop_path}`;
}

export function getMiniCpmLauncherStatusUrl(launcher: MiniCpmLocalLauncherContract): string {
  return `${normalizeBaseUrl(launcher.base_url)}${launcher.status_path || '/status'}`;
}

export async function startMiniCpmLocalAgent(
  launcher: MiniCpmLocalLauncherContract,
  payload: MiniCpmLauncherStartPayload,
  fetchImpl: typeof fetch = fetch
): Promise<MiniCpmLauncherStartResponse> {
  const response = await fetchImpl(getMiniCpmLauncherStartUrl(launcher), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Local launcher request failed: ${response.status}`);
  }

  const data = await response.json() as MiniCpmLauncherStartResponse;
  if (!data.ok) {
    throw new Error(data.message || data.error || 'Local launcher failed to start agent.');
  }
  return data;
}

export async function shutdownMiniCpmLocalLauncher(
  launcher: MiniCpmLocalLauncherContract,
  fetchImpl: typeof fetch = fetch
): Promise<MiniCpmLauncherShutdownResponse> {
  const response = await fetchImpl(getMiniCpmLauncherShutdownUrl(launcher), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Local launcher shutdown request failed: ${response.status}`);
  }

  const data = await response.json() as MiniCpmLauncherShutdownResponse;
  if (!data.ok) {
    throw new Error(data.message || data.error || 'Local launcher failed to shut down.');
  }
  return data;
}

export async function fetchMiniCpmLocalAgentStatus(
  launcher: MiniCpmLocalLauncherContract,
  fetchImpl: typeof fetch = fetch
): Promise<MiniCpmLauncherStatusResponse> {
  const response = await fetchImpl(getMiniCpmLauncherStatusUrl(launcher), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Local launcher status request failed: ${response.status}`);
  }

  const data = await response.json() as MiniCpmLauncherStatusResponse;
  if (!data.ok) {
    throw new Error(data.message || data.error || 'Local launcher status request failed.');
  }
  return data;
}

export function buildMiniCpmWebSocketUrl(
  apiBase: string,
  websocketPath: string,
  mode?: 'audio' | 'video'
): string {
  const base = new URL(normalizeBaseUrl(apiBase));
  const endpoint = new URL(
    websocketPath.startsWith('/') ? websocketPath : `/${websocketPath}`,
    base
  );
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = endpoint.pathname;
  base.search = endpoint.search;
  if (mode) {
    base.searchParams.set('mode', mode);
  }
  base.hash = '';
  return base.toString();
}

export function float32ToBase64(samples: Float32Array): string {
  return bytesToBase64(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
}

export function base64ToFloat32(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  const byteLength = bytes.byteLength - (bytes.byteLength % 4);
  if (byteLength <= 0) return new Float32Array();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + byteLength);
  return new Float32Array(buffer);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
