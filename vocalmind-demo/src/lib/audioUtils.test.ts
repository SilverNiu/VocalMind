import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TARGET_SAMPLE_RATE,
  encodePcmChunksAsWavBase64,
} from './audioUtils';

function bytesFromBase64(base64: string): Uint8Array {
  return Buffer.from(base64, 'base64');
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end)).toString('ascii');
}

describe('encodePcmChunksAsWavBase64', () => {
  it('encodes browser PCM chunks as a 16 kHz mono WAV payload', () => {
    const firstChunk = new Float32Array(4800).fill(0.25);
    const secondChunk = new Float32Array(4800).fill(-0.25);

    const wavBase64 = encodePcmChunksAsWavBase64(
      [firstChunk, secondChunk],
      48000
    );
    const bytes = bytesFromBase64(wavBase64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    assert.equal(ascii(bytes, 0, 4), 'RIFF');
    assert.equal(ascii(bytes, 8, 12), 'WAVE');
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), TARGET_SAMPLE_RATE);
    assert.equal(view.getUint32(40, true), 3200 * 2);
    assert.equal((bytes.byteLength - 44) / 2, 3200);
  });
});
