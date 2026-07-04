export const TARGET_SAMPLE_RATE = 16000;

export function encodePcmChunksAsWavBase64(
  chunks: Float32Array[],
  inputSampleRate: number,
  outputSampleRate: number = TARGET_SAMPLE_RATE
): string {
  const mergedSamples = mergePcmChunks(chunks);
  const outputSamples = resamplePcmSamples(
    mergedSamples,
    inputSampleRate,
    outputSampleRate
  );

  return encodeWAV(outputSamples, outputSampleRate);
}

export function mergePcmChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((length, chunk) => length + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

export function resamplePcmSamples(
  samples: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number = TARGET_SAMPLE_RATE
): Float32Array {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    throw new Error('inputSampleRate must be a positive number.');
  }
  if (!Number.isFinite(outputSampleRate) || outputSampleRate <= 0) {
    throw new Error('outputSampleRate must be a positive number.');
  }
  if (samples.length === 0 || inputSampleRate === outputSampleRate) {
    return samples.slice();
  }

  const outputLength = Math.max(
    1,
    Math.round(samples.length * outputSampleRate / inputSampleRate)
  );
  const output = new Float32Array(outputLength);
  const ratio = inputSampleRate / outputSampleRate;

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(lowerIndex + 1, samples.length - 1);
    const fraction = sourceIndex - lowerIndex;
    const lowerValue = samples[lowerIndex] ?? 0;
    const upperValue = samples[upperIndex] ?? lowerValue;
    output[i] = lowerValue + (upperValue - lowerValue) * fraction;
  }

  return output;
}

export function encodeWAV(samples: Float32Array, sampleRate: number = 16000): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}
