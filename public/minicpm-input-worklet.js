class MiniCpmInputProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    if (input?.length) {
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      this.port.postMessage(chunk, [chunk.buffer]);
    }

    const output = outputs[0];
    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      output[channelIndex].fill(0);
    }

    return true;
  }
}

registerProcessor('minicpm-input-capture', MiniCpmInputProcessor);
