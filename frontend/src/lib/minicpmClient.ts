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

export interface MiniCpmLocalAgentContract {
  websocket_path: string;
  mode: 'audio' | 'video';
  script: string;
  description: string;
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
