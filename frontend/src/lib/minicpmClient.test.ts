import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64ToFloat32,
  buildMiniCpmWebSocketUrl,
  float32ToBase64,
  getMiniCpmConfigUrl,
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

describe('float32/base64 conversion', () => {
  it('round-trips MiniCPM float32 PCM payloads', () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1]);

    const encoded = float32ToBase64(samples);
    const decoded = base64ToFloat32(encoded);

    assert.deepEqual(Array.from(decoded), Array.from(samples));
  });
});
