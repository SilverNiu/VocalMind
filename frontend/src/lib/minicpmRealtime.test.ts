import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMiniCpmInputAppendMessage,
  extractMiniCpmOutputDelta,
  resampleFloat32,
  shouldAttachVideoFrame,
} from './minicpmRealtime';

describe('resampleFloat32', () => {
  it('downsamples browser PCM into MiniCPM 16 kHz float32 PCM', () => {
    const input = new Float32Array([1, 3, 5, 7]);

    const output = resampleFloat32(input, 4, 2);

    assert.deepEqual(Array.from(output), [2, 6]);
  });
});

describe('buildMiniCpmInputAppendMessage', () => {
  it('matches the MiniCPM demo input.append envelope', () => {
    assert.deepEqual(
      buildMiniCpmInputAppendMessage({
        audioBase64: 'pcm',
        forceListen: false,
        videoFrames: ['jpeg'],
      }),
      {
        type: 'input.append',
        input: {
          audio: 'pcm',
          force_listen: false,
          video_frames: ['jpeg'],
        },
      }
    );
  });
});

describe('extractMiniCpmOutputDelta', () => {
  it('normalizes direct and payload delta fields from the realtime API', () => {
    assert.deepEqual(
      extractMiniCpmOutputDelta({
        type: 'response.output.delta',
        payload: {
          kind: 'text',
          delta: '你好',
        },
      }),
      {
        kind: 'text',
        text: '你好',
        audio: undefined,
      }
    );
  });
});

describe('shouldAttachVideoFrame', () => {
  it('limits video frame uploads to the requested FPS', () => {
    assert.equal(shouldAttachVideoFrame(2000, 0, 1), true);
    assert.equal(shouldAttachVideoFrame(2500, 2000, 1), false);
    assert.equal(shouldAttachVideoFrame(3000, 2000, 1), true);
  });
});
