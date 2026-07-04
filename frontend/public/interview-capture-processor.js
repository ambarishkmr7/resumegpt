// AudioWorklet: captures mono mic frames and posts them to the main thread.
// The AudioContext runs at 16 kHz, so frames are already at the rate Gemini
// Live expects — the main thread just converts Float32 -> PCM16 and sends them.
class InterviewCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      // The input buffer is reused each render quantum — copy before posting.
      this.port.postMessage(input[0].slice(0));
    }
    return true; // keep the processor alive for the whole session
  }
}

registerProcessor("interview-capture-processor", InterviewCaptureProcessor);
