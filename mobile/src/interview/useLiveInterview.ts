import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { InterviewReport, LiveServerMessage } from "../api/types";
import {
  ensureMicPermission,
  InterviewAudioEngine,
  MIC_BUFFER_SAMPLES,
} from "../audio/engine";
import {
  base64ToFloat32,
  floatToPcm16Base64,
  mergeFloat32,
} from "../audio/pcm";
import {
  LiveInterviewSocket,
  WS_CODE_NOT_FOUND,
  WS_CODE_UNAUTHORIZED,
  WS_CODE_USAGE_EXHAUSTED,
} from "./liveSocket";

const FALLBACK_CAP = 60 * 60; // backend enforces the real per-session cap

export type LivePhase =
  | "idle"
  | "connecting"
  | "live"
  | "ending"
  | "report"
  | "error";

export interface LiveResult {
  report: InterviewReport | null;
  sessionId: string | null;
  durationSeconds: number;
}

// Full lifecycle of one live interview session — the native port of
// MockInterview.jsx's audio graph + socket handling.
export function useLiveInterview(resumeId: string) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<LivePhase>("idle");
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [capSeconds, setCapSeconds] = useState(FALLBACK_CAP);
  const [needsPaywall, setNeedsPaywall] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);

  const engineRef = useRef<InterviewAudioEngine | null>(null);
  const socketRef = useRef<LiveInterviewSocket | null>(null);
  const micChunksRef = useRef<Float32Array[]>([]);
  const micLenRef = useRef(0);
  const mutedRef = useRef(false);
  const endedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capRef = useRef(FALLBACK_CAP);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    const engine = engineRef.current;
    engineRef.current = null;
    if (engine) void engine.stop();
    micChunksRef.current = [];
    micLenRef.current = 0;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const flushMic = useCallback(() => {
    if (micLenRef.current === 0) return;
    const merged = mergeFloat32(micChunksRef.current, micLenRef.current);
    micChunksRef.current = [];
    micLenRef.current = 0;
    socketRef.current?.sendAudio(floatToPcm16Base64(merged));
  }, []);

  const failToIdle = useCallback(
    (message: string) => {
      setError(message);
      cleanup();
      setPhase("error");
    },
    [cleanup],
  );

  const handleReport = useCallback(
    (data: { session_id?: string; report?: InterviewReport; duration_seconds?: number }) => {
      endedRef.current = true;
      setResult({
        report: data?.report ?? null,
        sessionId: data?.session_id ?? null,
        durationSeconds: data?.duration_seconds ?? 0,
      });
      cleanup();
      setPhase("report");
      void qc.invalidateQueries({ queryKey: ["interview-sessions"] });
      void qc.invalidateQueries({ queryKey: ["usage"] });
    },
    [cleanup, qc],
  );

  const end = useCallback(() => {
    endedRef.current = true;
    setStatusLine("Generating your report…");
    setPhase("ending");
    flushMic();
    const socket = socketRef.current;
    if (socket?.isOpen) {
      socket.sendEnd();
    } else {
      cleanup();
      setPhase("idle");
    }
  }, [cleanup, flushMic]);

  const endRef = useRef(end);
  endRef.current = end;

  const handleMessage = useCallback(
    (msg: LiveServerMessage) => {
      const engine = engineRef.current;
      if (msg.type === "audio") {
        engine?.playChunk(base64ToFloat32(msg.data));
        setAiSpeaking(true);
        setStatusLine("AI speaking…");
        if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = setTimeout(() => {
          setAiSpeaking(false);
          setStatusLine("Listening…");
        }, 600);
      } else if (msg.type === "interrupted") {
        engine?.flushPlayback();
        setAiSpeaking(false);
        setStatusLine("Listening…");
      } else if (msg.type === "status") {
        if (msg.state === "connected" || msg.state === "reconnected") {
          setStatusLine("Listening…");
        } else if (msg.state === "reconnecting") {
          setStatusLine("Reconnecting…");
        } else if (msg.state === "time_up") {
          setStatusLine("Time's up — wrapping up…");
        }
      } else if (msg.type === "report") {
        handleReport(msg.data);
      } else if (msg.type === "error") {
        if (msg.code === "usage_exhausted") {
          cleanup();
          setPhase("idle");
          setNeedsPaywall(true);
        } else {
          failToIdle(msg.message || "The interview ended unexpectedly.");
        }
      }
    },
    [cleanup, failToIdle, handleReport],
  );

  const start = useCallback(async () => {
    setError("");
    setResult(null);
    setElapsed(0);
    setMuted(false);
    setNeedsPaywall(false);
    endedRef.current = false;

    // Refresh balance; block when out of minutes (backend enforces too).
    try {
      const usage = await api.usageSummary();
      if ((usage.available_seconds || 0) <= 0) {
        setNeedsPaywall(true);
        return;
      }
      const cap = Math.min(usage.available_seconds || 0, FALLBACK_CAP) || FALLBACK_CAP;
      capRef.current = cap;
      setCapSeconds(cap);
    } catch {
      /* meter is best-effort */
    }

    setPhase("connecting");
    setStatusLine("Requesting microphone…");

    if (!(await ensureMicPermission())) {
      failToIdle("Microphone access is required for the live interview.");
      return;
    }

    setStatusLine("Connecting…");
    const engine = new InterviewAudioEngine();
    engineRef.current = engine;
    try {
      await engine.start((frame) => {
        if (mutedRef.current) return;
        micChunksRef.current.push(frame);
        micLenRef.current += frame.length;
        if (micLenRef.current >= MIC_BUFFER_SAMPLES) flushMic();
      });
    } catch (e) {
      failToIdle(
        `Could not start audio: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }

    const socket = new LiveInterviewSocket();
    socketRef.current = socket;
    socket.connect(resumeId, {
      onOpen: () => {
        setPhase("live");
        setStatusLine("Listening…");
        timerRef.current = setInterval(() => {
          setElapsed((prev) => {
            const next = prev + 1;
            if (next >= capRef.current) endRef.current();
            return next;
          });
        }, 1000);
      },
      onMessage: handleMessage,
      onError: () => {
        if (!endedRef.current) setError("Connection error. Please try again.");
      },
      onClose: (code) => {
        if (endedRef.current) return;
        if (code === WS_CODE_USAGE_EXHAUSTED) {
          cleanup();
          setPhase("idle");
          setNeedsPaywall(true);
        } else if (code === WS_CODE_UNAUTHORIZED) {
          failToIdle("Your session expired — please sign in again.");
        } else if (code === WS_CODE_NOT_FOUND) {
          failToIdle("That resume could not be found.");
        } else {
          failToIdle(
            "The interview connection dropped. Progress may not have been saved.",
          );
        }
      },
    });
  }, [cleanup, failToIdle, flushMic, handleMessage, resumeId]);

  return {
    phase,
    statusLine,
    error,
    elapsed,
    capSeconds,
    muted,
    setMuted,
    aiSpeaking,
    needsPaywall,
    clearPaywall: () => setNeedsPaywall(false),
    result,
    start,
    end,
    reset: () => {
      cleanup();
      setPhase("idle");
      setError("");
      setResult(null);
    },
  };
}
