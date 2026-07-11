import { api } from "../api/client";
import type { LiveServerMessage } from "../api/types";

export interface LiveSocketCallbacks {
  onMessage: (msg: LiveServerMessage) => void;
  onOpen: () => void;
  onClose: (code: number) => void;
  onError: () => void;
}

// Close codes the backend uses on the live-interview socket.
export const WS_CODE_UNAUTHORIZED = 4401;
export const WS_CODE_USAGE_EXHAUSTED = 4402;
export const WS_CODE_NOT_FOUND = 4404;

// Thin wrapper over the relay socket: JSON in/out, base64 audio frames.
export class LiveInterviewSocket {
  private ws: WebSocket | null = null;

  connect(resumeId: string, callbacks: LiveSocketCallbacks): void {
    const ws = new WebSocket(api.liveInterviewWsUrl(resumeId));
    this.ws = ws;
    ws.onopen = () => callbacks.onOpen();
    ws.onmessage = (ev) => {
      let msg: LiveServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      callbacks.onMessage(msg);
    };
    ws.onerror = () => callbacks.onError();
    ws.onclose = (ev) => callbacks.onClose(ev.code ?? 1000);
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendAudio(base64Pcm16: string): void {
    if (this.isOpen) {
      this.ws!.send(JSON.stringify({ type: "audio", data: base64Pcm16 }));
    }
  }

  sendEnd(): void {
    if (this.isOpen) {
      this.ws!.send(JSON.stringify({ type: "end" }));
    }
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}
