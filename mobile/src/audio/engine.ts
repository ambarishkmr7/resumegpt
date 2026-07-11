// Live-interview audio engine built on react-native-audio-api.
// Capture: 16 kHz mono Float32 frames from the mic (what Gemini Live expects).
// Playback: 24 kHz PCM chunks scheduled gaplessly on an AudioContext, with an
// instant flush for barge-in — the native equivalent of the web app's
// interview-capture-processor / interview-pcm-player worklets.
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
} from "react-native-audio-api";
import type AudioBufferSourceNode from "react-native-audio-api/lib/typescript/core/AudioBufferSourceNode";

export const IN_RATE = 16000; // mic -> Gemini
export const OUT_RATE = 24000; // Gemini -> speaker
export const MIC_BUFFER_SAMPLES = 1600; // ~100 ms batches, like the web client

// Small scheduling cushion so the first chunk never starts in the past.
const JITTER_SECONDS = 0.12;

export async function ensureMicPermission(): Promise<boolean> {
  const status = await AudioManager.checkRecordingPermissions();
  if (status === "Granted") return true;
  return (await AudioManager.requestRecordingPermissions()) === "Granted";
}

export class InterviewAudioEngine {
  private recorder: AudioRecorder | null = null;
  private ctx: AudioContext | null = null;
  private scheduled = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  async start(onMicFrame: (frame: Float32Array) => void): Promise<void> {
    AudioManager.setAudioSessionOptions({
      iosCategory: "playAndRecord",
      iosMode: "voiceChat",
      iosOptions: ["defaultToSpeaker", "allowBluetoothHFP"],
    });
    await AudioManager.setAudioSessionActivity(true).catch(() => {
      /* Android has no session activation; iOS failures surface on start() */
    });

    this.ctx = new AudioContext({ sampleRate: OUT_RATE });
    this.nextStartTime = 0;

    this.recorder = new AudioRecorder();
    this.recorder.onAudioReady(
      {
        sampleRate: IN_RATE,
        bufferLength: MIC_BUFFER_SAMPLES,
        channelCount: 1,
      },
      (event) => {
        // Copy — the native buffer may be reused between callbacks.
        const data = event.buffer.getChannelData(0);
        onMicFrame(new Float32Array(data));
      },
    );
    const result = await this.recorder.start();
    if (result.status === "error") {
      throw new Error(result.message || "Could not start the microphone.");
    }
  }

  // Queue a chunk of 24 kHz mono samples right after whatever is playing.
  playChunk(samples: Float32Array): void {
    const ctx = this.ctx;
    if (!ctx || samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, OUT_RATE);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.nextStartTime < now + JITTER_SECONDS) {
      this.nextStartTime = now + JITTER_SECONDS;
    }
    src.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduled.add(src);
    src.onEnded = () => this.scheduled.delete(src);
  }

  // Barge-in: kill everything queued and reset the cursor.
  flushPlayback(): void {
    for (const src of this.scheduled) {
      try {
        src.stop();
      } catch {
        /* already ended */
      }
    }
    this.scheduled.clear();
    this.nextStartTime = 0;
  }

  // True while model audio is still queued/playing (drives the speaking orb).
  isPlaying(): boolean {
    return !!this.ctx && this.nextStartTime > this.ctx.currentTime;
  }

  async stop(): Promise<void> {
    try {
      this.recorder?.clearOnAudioReady();
      await this.recorder?.stop();
    } catch {
      /* recorder already stopped */
    }
    this.recorder = null;
    this.flushPlayback();
    try {
      await this.ctx?.close();
    } catch {
      /* context already closed */
    }
    this.ctx = null;
    await AudioManager.setAudioSessionActivity(false).catch(() => {});
  }
}
