export const DEFAULT_API_BASE = 'http://101.35.234.4:18080';

export interface BackendConfig {
  apiBase: string;
  wsUrl: string | null;
}

export interface CompanionPayload {
  userText: string;
  audioBase64?: string;
  audioFormat?: 'wav';
  imageBase64?: string;
}

export interface BackendEmotion {
  label?: string;
}

export interface CompanionResponse {
  ok?: boolean;
  type?: string;
  audio_emotion?: BackendEmotion | null;
  face_emotion?: BackendEmotion | null;
  fusion_emotion?: BackendEmotion | null;
  reply?: string | null;
  request_meta?: {
    client_name?: string;
    client_platform?: string;
    request_id?: string;
  };
}

type ViteEnv = Partial<Record<'VITE_API_BASE' | 'VITE_WS_URL', string>>;

export function getBackendConfig(env: ViteEnv = getViteEnv()): BackendConfig {
  return {
    apiBase: normalizeBaseUrl(env.VITE_API_BASE || DEFAULT_API_BASE),
    wsUrl: normalizeOptionalUrl(env.VITE_WS_URL),
  };
}

export function buildCompanionRespondFormData(payload: CompanionPayload): FormData {
  const formData = new FormData();
  formData.append('user_text', payload.userText);

  if (payload.audioBase64) {
    const audioBlob = base64ToBlob(payload.audioBase64, 'audio/wav');
    formData.append('audio_file', audioBlob, `audio.${payload.audioFormat || 'wav'}`);
  }

  if (payload.imageBase64) {
    const imageBlob = base64ToBlob(payload.imageBase64, 'image/jpeg');
    formData.append('image_file', imageBlob, 'frame.jpg');
  }

  return formData;
}

export function buildCompanionRequestHeaders(requestId: string = createRequestId()): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Client-Name': 'VocalMind',
    'X-Client-Platform': 'web',
    'X-Request-Id': requestId,
  };
}

export async function postCompanionRespond(
  apiBase: string,
  payload: CompanionPayload,
  fetchImpl: typeof fetch = fetch,
  requestId: string = createRequestId()
): Promise<CompanionResponse> {
  const response = await fetchImpl(`${normalizeBaseUrl(apiBase)}/companion/respond`, {
    method: 'POST',
    headers: buildCompanionRequestHeaders(requestId),
    body: buildCompanionRespondFormData(payload),
  });

  if (!response.ok) {
    throw new Error(`Companion HTTP request failed: ${response.status}`);
  }

  const data = await response.json() as CompanionResponse;
  const responseRequestId = response.headers.get('X-Request-Id');
  if (responseRequestId) {
    return {
      ...data,
      request_meta: {
        ...data.request_meta,
        request_id: responseRequestId,
      },
    };
  }
  return data;
}

function getViteEnv(): ViteEnv {
  return (import.meta as unknown as { env?: ViteEnv }).env || {};
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeOptionalUrl(url: string | undefined): string | null {
  const normalized = url?.trim().replace(/\/+$/, '');
  return normalized || null;
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `vm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function base64ToBlob(value: string, fallbackType: string): Blob {
  const { base64, contentType } = splitBase64Media(value, fallbackType);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: contentType });
}

function splitBase64Media(value: string, fallbackType: string): {
  base64: string;
  contentType: string;
} {
  if (!value.startsWith('data:')) {
    return { base64: value, contentType: fallbackType };
  }

  const [header, base64] = value.split(',', 2);
  const contentType = header.slice(5).split(';', 1)[0] || fallbackType;
  return { base64, contentType };
}
