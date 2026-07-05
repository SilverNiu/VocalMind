import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64ToFloat32,
  buildMiniCpmWebSocketUrl,
  fetchMiniCpmLocalAgentStatus,
  float32ToBase64,
  getMiniCpmLauncherShutdownUrl,
  getMiniCpmLauncherStartUrl,
  getMiniCpmLauncherStatusUrl,
  getMiniCpmConfigUrl,
  shutdownMiniCpmLocalLauncher,
  startMiniCpmLocalAgent,
} from './minicpmClient';

describe('getMiniCpmConfigUrl', () => {
  it('builds the MiniCPM config endpoint from the configured API base', () => {
    assert.equal(
      getMiniCpmConfigUrl('http://127.0.0.1:8000/'),
      'http://127.0.0.1:8000/voice/minicpm/config'
    );
  });
});

describe('buildMiniCpmWebSocketUrl', () => {
  it('converts an HTTP API base and backend WebSocket path into a browser WebSocket URL', () => {
    assert.equal(
      buildMiniCpmWebSocketUrl('https://ai-health-app.online', '/voice/minicpm'),
      'wss://ai-health-app.online/voice/minicpm'
    );
  });

  it('preserves the MiniCPM realtime mode query for local-agent video sessions', () => {
    assert.equal(
      buildMiniCpmWebSocketUrl('http://127.0.0.1:8000', '/voice/minicpm?mode=video'),
      'ws://127.0.0.1:8000/voice/minicpm?mode=video'
    );
  });
});

describe('local launcher helpers', () => {
  const launcher = {
    base_url: 'http://127.0.0.1:18990/',
    start_path: '/start-minicpm-agent',
    health_path: '/health',
    stop_path: '/stop-minicpm-agent',
    shutdown_path: '/shutdown',
    status_path: '/status',
    script: 'scripts/local_agent_launcher.py',
  };

  it('builds the launcher start URL without requiring a project path', () => {
    assert.equal(
      getMiniCpmLauncherStartUrl(launcher),
      'http://127.0.0.1:18990/start-minicpm-agent'
    );
  });

  it('posts the backend API base and MiniCPM mode to the local launcher', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, started: true, pid: 1234 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await startMiniCpmLocalAgent(
      launcher,
      {
        api_base: 'http://101.35.234.4:18080',
        mode: 'audio',
        minicpm_realtime_url: 'wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio',
      },
      fetchImpl as typeof fetch
    );

    assert.equal(result.started, true);
    assert.equal(requests[0].url, 'http://127.0.0.1:18990/start-minicpm-agent');
    assert.equal(requests[0].init?.method, 'POST');
    assert.equal(
      requests[0].init?.body,
      JSON.stringify({
        api_base: 'http://101.35.234.4:18080',
        mode: 'audio',
        minicpm_realtime_url: 'wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio',
      })
    );
  });

  it('posts to the local launcher shutdown endpoint when ending the session', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, shutdown: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    assert.equal(
      getMiniCpmLauncherShutdownUrl(launcher),
      'http://127.0.0.1:18990/shutdown'
    );

    const result = await shutdownMiniCpmLocalLauncher(launcher, fetchImpl as typeof fetch);

    assert.equal(result.shutdown, true);
    assert.equal(requests[0].url, 'http://127.0.0.1:18990/shutdown');
    assert.equal(requests[0].init?.method, 'POST');
  });

  it('fetches the local agent status exposed by the launcher', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({
        ok: true,
        running: true,
        status: {
          ok: true,
          mode: 'video',
          emotion_modalities: ['audio', 'face'],
          cpm_messages: [
            { id: 'assistant-1', role: 'assistant', text: '你好', complete: true },
          ],
          last_emotion_response: {
            audio_emotion: { source: 'audio', label: 'calm', confidence: 0.8 },
            face_emotion: { source: 'face', label: 'happy', confidence: 0.7 },
            fusion_emotion: { source: 'fusion', label: 'relaxed', confidence: 0.75 },
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    assert.equal(getMiniCpmLauncherStatusUrl(launcher), 'http://127.0.0.1:18990/status');

    const result = await fetchMiniCpmLocalAgentStatus(launcher, fetchImpl as typeof fetch);

    assert.equal(requests[0].url, 'http://127.0.0.1:18990/status');
    assert.equal(result.running, true);
    assert.equal(result.status?.mode, 'video');
    assert.equal(result.status?.last_emotion_response?.face_emotion?.label, 'happy');
  });
});

describe('float32/base64 conversion', () => {
  it('round-trips MiniCPM float32 PCM payloads', () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1]);

    const encoded = float32ToBase64(samples);
    const decoded = base64ToFloat32(encoded);

    assert.deepEqual(Array.from(decoded), Array.from(samples));
  });
});
