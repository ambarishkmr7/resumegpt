// AudioWorklet: a small ring-buffer player. The main thread posts Float32
// chunks (already resampled to the output AudioContext's sample rate) and this
// processor streams them to the speakers. Posting "flush" clears the queue,
// used to stop playback instantly when the model is interrupted (barge-in).
class InterviewPcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readIndex = 0;
    this.port.onmessage = (e) => {
      const data = e.data;
      if (data === "flush" || (data && data.type === "flush")) {
        this.queue = [];
        this.readIndex = 0;
        return;
      }
      if (data && data.length) this.queue.push(data);
    };
  }

  process(_inputs, outputs) {
    const channel = outputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      if (this.queue.length === 0) {
        channel[i] = 0;
        continue;
      }
      const cur = this.queue[0];
      channel[i] = cur[this.readIndex++];
      if (this.readIndex >= cur.length) {
        this.queue.shift();
        this.readIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("interview-pcm-player", InterviewPcmPlayer);
