import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_API_BASE,
  buildCompanionRequestHeaders,
  buildCompanionRespondFormData,
  getBackendConfig,
  postCompanionRespond,
} from './backendClient';

describe('getBackendConfig', () => {
  it('uses the working HTTP API by default and does not enable WebSocket implicitly', () => {
    const config = getBackendConfig({});

    assert.equal(config.apiBase, DEFAULT_API_BASE);
    assert.equal(config.wsUrl, null);
  });

  it('allows explicit API and WebSocket URLs from Vite env', () => {
    const config = getBackendConfig({
      VITE_API_BASE: 'https://api.example.test/',
      VITE_WS_URL: 'wss://api.example.test/ws/companion',
    });

    assert.equal(config.apiBase, 'https://api.example.test');
    assert.equal(config.wsUrl, 'wss://api.example.test/ws/companion');
  });
});

describe('buildCompanionRespondFormData', () => {
  it('builds multipart fields for the HTTP companion endpoint', () => {
    const formData = buildCompanionRespondFormData({
      userText: 'hello',
      audioBase64: Buffer.from('RIFFdemoWAVE').toString('base64'),
      audioFormat: 'wav',
      imageBase64: `data:image/jpeg;base64,${Buffer.from('\xff\xd8demo').toString('base64')}`,
    });

    assert.equal(formData.get('user_text'), 'hello');

    const audio = formData.get('audio_file') as File;
    const image = formData.get('image_file') as File;

    assert.equal(audio.name, 'audio.wav');
    assert.equal(audio.type, 'audio/wav');
    assert.equal(image.name, 'frame.jpg');
    assert.equal(image.type, 'image/jpeg');
  });
});

describe('buildCompanionRequestHeaders', () => {
  it('adds traceable frontend request headers without setting multipart content type', () => {
    const headers = buildCompanionRequestHeaders('request-123');

    assert.equal(headers['Accept'], 'application/json');
    assert.equal(headers['X-Client-Name'], 'VocalMind');
    assert.equal(headers['X-Client-Platform'], 'web');
    assert.equal(headers['X-Request-Id'], 'request-123');
    assert.equal('Content-Type' in headers, false);
  });
});

describe('postCompanionRespond', () => {
  it('sends frontend request headers to the companion endpoint', async () => {
    let requestInit: RequestInit | undefined;
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': 'request-456',
        },
      });
    };

    const response = await postCompanionRespond(
      'https://api.example.test',
      { userText: 'hello' },
      fetchImpl,
      'request-456'
    );

    assert.deepEqual(requestInit?.headers, {
      Accept: 'application/json',
      'X-Client-Name': 'VocalMind',
      'X-Client-Platform': 'web',
      'X-Request-Id': 'request-456',
    });
    assert.equal(response.request_meta?.request_id, 'request-456');
  });
});
