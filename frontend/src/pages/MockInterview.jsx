import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import SubscriptionModal from "../components/SubscriptionModal.jsx";

const FALLBACK_CAP = 60 * 60; // default per-session ceiling (backend enforces the real cap)
const IN_RATE = 16000;       // mic capture + AudioContext rate (Gemini input)
const OUT_RATE = 24000;      // Gemini output audio rate
const MIC_FLUSH_SAMPLES = 1600; // ~100ms batches to Gemini
const MAX_DRAIN_MS = 10000;  // longest we'll wait for queued AI audio to finish

// ---- audio helpers ----------------------------------------------------------

function floatToPcm16Base64(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToInt16(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// Linear-resample the model's 24kHz audio down to the 16kHz output context.
function resampleToContext(float, fromRate, toRate) {
  if (fromRate === toRate) return float;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(float.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const frac = idx - i0;
    const s0 = float[i0] || 0;
    const s1 = i0 + 1 < float.length ? float[i0 + 1] : s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---- report view ------------------------------------------------------------

function scoreColor(score) {
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function ReportView({ report, audioUrl, durationSeconds }) {
  if (!report) return null;
  const score = report.overall_score ?? 0;
  return (
    <div className="mi-report">
      <div className="mi-report-head">
        <div className="mi-score-ring" style={{ "--sc": scoreColor(score) }}>
          <span className="mi-score-num">{score}</span>
          <span className="mi-score-lbl">/ 100</span>
        </div>
        <div>
          <div className="mi-verdict">{report.verdict || "Interview complete"}</div>
          {report.summary && <p className="mi-summary">{report.summary}</p>}
          {durationSeconds != null && (
            <div className="mi-meta">Duration: {fmtTime(durationSeconds)}</div>
          )}
        </div>
      </div>

      {audioUrl && (
        <div className="mi-card">
          <h4>🎧 Listen back</h4>
          <audio controls preload="metadata" src={audioUrl} style={{ width: "100%" }} />
        </div>
      )}

      {report.competencies?.length > 0 && (
        <div className="mi-card">
          <h4>Competencies</h4>
          {report.competencies.map((c, i) => (
            <div key={i} className="mi-comp">
              <div className="mi-comp-row">
                <span>{c.name}</span>
                <strong style={{ color: scoreColor(c.score ?? 0) }}>{c.score ?? 0}</strong>
              </div>
              <div className="mi-bar"><div className="mi-bar-fill" style={{ width: `${Math.max(0, Math.min(100, c.score ?? 0))}%`, background: scoreColor(c.score ?? 0) }} /></div>
              {c.note && <p className="mi-note">{c.note}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mi-two-col">
        {report.strengths?.length > 0 && (
          <div className="mi-card">
            <h4>✅ Strengths</h4>
            <ul>{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {report.weaknesses?.length > 0 && (
          <div className="mi-card">
            <h4>⚠️ Areas to improve</h4>
            <ul>{report.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>

      {report.recommendations?.length > 0 && (
        <div className="mi-card">
          <h4>🎯 Recommendations</h4>
          <ul>{report.recommendations.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      {report.question_notes?.length > 0 && (
        <div className="mi-card">
          <h4>📋 Question-by-question</h4>
          {report.question_notes.map((q, i) => (
            <div key={i} className="mi-qnote">
              <div className="mi-qnote-q">{q.question}</div>
              <div className="mi-qnote-a">{q.assessment}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- main page --------------------------------------------------------------

export default function MockInterview() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [view, setView] = useState("home");     // home | live | report
  const [status, setStatus] = useState("");     // human-readable status line
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [ending, setEnding] = useState(false);   // session closed, report on its way

  const [sessions, setSessions] = useState(null);
  const [activeReport, setActiveReport] = useState(null); // {report, audioUrl, durationSeconds}
  const [usage, setUsage] = useState(null);      // interview-minute balance
  const [capSeconds, setCapSeconds] = useState(FALLBACK_CAP); // this session's timer max
  const [showSub, setShowSub] = useState(false); // purchase modal
  const [subTab, setSubTab] = useState("plans");
  const capRef = useRef(FALLBACK_CAP);

  // mutable refs (audio graph + socket)
  const wsRef = useRef(null);
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const playerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const micBufRef = useRef([]);
  const micLenRef = useRef(0);
  const mutedRef = useRef(false);
  const timerRef = useRef(null);
  const aiTimeoutRef = useRef(null);
  const pendingSessionRef = useRef(null);
  const objectUrlsRef = useRef([]);
  const endedRef = useRef(false); // true once End was requested or a report arrived
  const finalizedRef = useRef(false); // server gave a final outcome (report or error)
  const drainTimerRef = useRef(null);
  const playAtRef = useRef(0);    // AudioContext time when queued AI audio runs dry
  // Lets the timer reach endInterview, which is declared further down.
  const endInterviewRef = useRef(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const loadSessions = useCallback(async () => {
    try { setSessions(await api.listInterviewSessions(id)); }
    catch { setSessions([]); }
  }, [id]);

  const loadUsage = useCallback(async () => {
    try {
      const u = await api.usageSummary();
      setUsage(u);
      const cap = Math.min(u.available_seconds || 0, FALLBACK_CAP) || FALLBACK_CAP;
      capRef.current = cap;
      setCapSeconds(cap);
    } catch { /* meter is best-effort */ }
  }, []);

  useEffect(() => { loadSessions(); loadUsage(); }, [loadSessions, loadUsage]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Always route interval creation through here. timerRef holds a single handle,
  // so starting a second clock without clearing the first (a re-opened socket, a
  // double mount) orphans the original: it keeps calling setElapsed forever and
  // stopTimer can never reach it — the clock visibly ran on through
  // "Generating your report…" even though every end path calls stopTimer.
  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      // Second guard: once the session is over the clock must not advance, even
      // if some interval outlived its handle.
      if (endedRef.current) { stopTimer(); return; }
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= capRef.current) endInterviewRef.current?.();
        return next;
      });
    }, 1000);
  }, [stopTimer]);

  // Stop capturing (clock, recorder, socket, mic) but leave the output context
  // alive so audio the AI has already streamed can still play out.
  const stopCapture = useCallback(() => {
    stopTimer();
    if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
    try { recorderRef.current && recorderRef.current.state !== "inactive" && recorderRef.current.stop(); } catch (_) {}
    try { wsRef.current && wsRef.current.close(); } catch (_) {}
    wsRef.current = null;
    try { streamRef.current && streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
    streamRef.current = null;
  }, [stopTimer]);

  const closeAudio = useCallback(() => {
    if (drainTimerRef.current) { clearTimeout(drainTimerRef.current); drainTimerRef.current = null; }
    try { ctxRef.current && ctxRef.current.state !== "closed" && ctxRef.current.close(); } catch (_) {}
    ctxRef.current = null;
    playerRef.current = null;
    playAtRef.current = 0;
  }, []);

  const cleanup = useCallback(() => { stopCapture(); closeAudio(); }, [stopCapture, closeAudio]);

  // Closing the context instantly would cut the interviewer off mid-goodbye, so
  // hold it open until the audio already queued in the player worklet drains.
  const closeAudioAfterPlayback = useCallback(() => {
    const ctx = ctxRef.current;
    const remainingMs = ctx ? Math.max(0, playAtRef.current - ctx.currentTime) * 1000 : 0;
    if (remainingMs <= 0) { closeAudio(); return; }
    if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
    drainTimerRef.current = setTimeout(() => {
      drainTimerRef.current = null;
      closeAudio();
    }, Math.min(remainingMs + 150, MAX_DRAIN_MS));
  }, [closeAudio]);

  // Cleanup on unmount
  useEffect(() => () => {
    cleanup();
    objectUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
  }, [cleanup]);

  const flushMic = () => {
    if (micLenRef.current === 0) return;
    const merged = new Float32Array(micLenRef.current);
    let off = 0;
    for (const b of micBufRef.current) { merged.set(b, off); off += b.length; }
    micBufRef.current = []; micLenRef.current = 0;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "audio", data: floatToPcm16Base64(merged) }));
    }
  };

  const handleReport = useCallback((data) => {
    endedRef.current = true;
    finalizedRef.current = true;
    pendingSessionRef.current = data?.session_id || null;
    const report = data?.report || null;
    const durationSeconds = data?.duration_seconds ?? elapsed;
    // Stop recording; the onstop handler builds the blob, plays it locally, and uploads it.
    const finish = (audioUrl) => {
      setActiveReport({ report, audioUrl, durationSeconds });
      setView("report");
      stopCapture();
      closeAudioAfterPlayback();
      loadSessions();
    };
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = async () => {
        let audioUrl = null;
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          if (blob.size > 0) {
            audioUrl = URL.createObjectURL(blob);
            objectUrlsRef.current.push(audioUrl);
            if (pendingSessionRef.current) {
              api.uploadInterviewAudio(pendingSessionRef.current, blob).catch(() => {});
            }
          }
        } catch (_) {}
        finish(audioUrl);
      };
      try { rec.stop(); } catch { finish(null); }
    } else {
      finish(null);
    }
  }, [stopCapture, closeAudioAfterPlayback, elapsed, loadSessions]);

  const endInterview = useCallback(() => {
    if (endedRef.current) return; // already ending — don't send a second "end"
    endedRef.current = true;
    // The session is over the moment End is pressed: freeze the clock instead of
    // letting it tick through report generation.
    stopTimer();
    setEnding(true);
    setStatus("Generating your report…");
    const ws = wsRef.current;
    flushMic();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end" }));
    } else {
      // No live socket — nothing to grade.
      cleanup();
      setView("home");
    }
  }, [cleanup, stopTimer]);

  useEffect(() => { endInterviewRef.current = endInterview; }, [endInterview]);

  const startInterview = useCallback(async () => {
    // Re-entry would reset `ending`/`endedRef` and open a second socket while the
    // first is still live — leaving two clocks running and the End button looking
    // active again mid-report. One session at a time.
    if (wsRef.current || timerRef.current) return;
    // Refresh the balance and block if the user is out of minutes.
    try {
      const u = await api.usageSummary();
      setUsage(u);
      if ((u.available_seconds || 0) <= 0) { setSubTab("refills"); setShowSub(true); return; }
      const cap = Math.min(u.available_seconds || 0, FALLBACK_CAP) || FALLBACK_CAP;
      capRef.current = cap; setCapSeconds(cap);
    } catch { /* fall through — backend still enforces the cap */ }
    setError(""); setActiveReport(null); setElapsed(0); setMuted(false); setEnding(false);
    endedRef.current = false; finalizedRef.current = false;
    pendingSessionRef.current = null; playAtRef.current = 0;
    setStatus("Requesting microphone…"); setView("live");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (_) {
      setError("Microphone access is required for the live interview.");
      setView("home");
      return;
    }
    streamRef.current = stream;

    try {
      setStatus("Connecting…");
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: IN_RATE });
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/interview-capture-processor.js");
      await ctx.audioWorklet.addModule("/interview-pcm-player.js");

      const micSource = ctx.createMediaStreamSource(stream);
      const captureNode = new AudioWorkletNode(ctx, "interview-capture-processor");
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      micSource.connect(captureNode);
      captureNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      const player = new AudioWorkletNode(ctx, "interview-pcm-player");
      player.connect(ctx.destination);
      playerRef.current = player;

      // Mix mic + AI into one stream and record the whole conversation.
      const mixDest = ctx.createMediaStreamDestination();
      micSource.connect(mixDest);
      player.connect(mixDest);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
      chunksRef.current = [];
      const rec = new MediaRecorder(mixDest.stream, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recorderRef.current = rec;
      rec.start(1000);

      // Mic frames -> batched -> Gemini
      captureNode.port.onmessage = (e) => {
        if (mutedRef.current) return;
        micBufRef.current.push(e.data);
        micLenRef.current += e.data.length;
        if (micLenRef.current >= MIC_FLUSH_SAMPLES) flushMic();
      };

      // Open the relay socket
      const ws = new WebSocket(api.liveInterviewWsUrl(id));
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("Listening…");
        startTimer();  // clears any previous clock before starting this one
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "audio") {
          const int16 = base64ToInt16(msg.data);
          const f = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 32768;
          const resampled = resampleToContext(f, OUT_RATE, IN_RATE);
          playerRef.current && playerRef.current.port.postMessage(resampled);
          const actx = ctxRef.current;
          if (actx) {
            // Track when the queued audio will run dry — Gemini streams faster
            // than realtime, so "last frame received" is not "done speaking".
            playAtRef.current = Math.max(playAtRef.current, actx.currentTime)
              + resampled.length / (actx.sampleRate || IN_RATE);
          }
          setAiSpeaking(true);
          // Once the session is closing, leave the "generating your report" line
          // in place instead of flipping back to the live status.
          if (!endedRef.current) setStatus("AI speaking…");
          if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
          aiTimeoutRef.current = setTimeout(() => {
            setAiSpeaking(false);
            if (!endedRef.current) setStatus("Listening…");
          }, 500);
        } else if (msg.type === "interrupted") {
          playerRef.current && playerRef.current.port.postMessage("flush");
          playAtRef.current = 0;
          setAiSpeaking(false);
          if (!endedRef.current) setStatus("Listening…");
        } else if (msg.type === "status") {
          if (msg.state === "connected" || msg.state === "reconnected") setStatus("Listening…");
          if (msg.state === "reconnecting") setStatus("Reconnecting…");
          if (msg.state === "time_up" || msg.state === "wrapping_up") {
            // The server is closing the session (time budget spent, or the
            // interviewer wrapped up on its own). Stop the clock and treat the
            // upcoming socket close as expected, not as a dropped connection.
            endedRef.current = true;
            stopTimer();
            setEnding(true);
            setStatus(msg.state === "time_up"
              ? "Time's up — generating your report…"
              : "Wrapping up — generating your report…");
          }
        } else if (msg.type === "report") {
          handleReport(msg.data);
        } else if (msg.type === "error") {
          // The server explained why it's stopping, and the socket close that
          // follows shouldn't overwrite that message with a generic one.
          endedRef.current = true;
          finalizedRef.current = true;
          stopTimer();
          if (msg.code === "usage_exhausted") {
            cleanup();
            setView("home");
            loadUsage();
            setSubTab("refills");
            setShowSub(true);
          } else {
            setError(msg.message || "The interview ended unexpectedly.");
            cleanup();
            setView("home");
          }
        }
      };

      ws.onerror = () => { if (!endedRef.current) setError("Connection error. Please try again."); };
      ws.onclose = () => {
        if (endedRef.current) {
          // Ended on purpose. The one bad case is the socket closing before the
          // report arrived — don't leave the user on a dead "generating…" screen.
          if (!finalizedRef.current) {
            setError("The interview ended, but the report didn't come through. Check Previous Interviews — the session may still have been saved.");
            cleanup();
            setView("home");
            loadSessions();
          }
          return;
        }
        // Unexpected drop before the interview was ended / a report arrived.
        setError("The interview connection dropped. Your progress up to this point may not have been saved.");
        cleanup();
        setView("home");
        loadSessions();
      };
    } catch (err) {
      setError("Could not start audio: " + (err?.message || err));
      cleanup();
      setView("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, endInterview, handleReport, cleanup, stopTimer, startTimer, loadUsage]);

  const openSession = async (row) => {
    try {
      const detail = await api.getInterviewSession(row.id);
      // The audio URL is just a reference — the backend streams it via HTTP
      // Range requests, so the <audio> element buffers progressively and can
      // seek without downloading the whole recording up front.
      const audioUrl = detail.has_audio ? api.interviewAudioStreamUrl(row.id) : null;
      setActiveReport({ report: detail.report, audioUrl, durationSeconds: detail.duration_seconds });
      setView("report");
    } catch (_) {
      setError("Could not load that interview.");
    }
  };

  // ---- render ----
  return (
    <div className="mi-page">
      <div className="mi-topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => { cleanup(); navigate(`/editor/${id}`); }}>← Back to editor</button>
        <div className="mi-title">🎙️ Live Mock Interview</div>
        <div style={{ width: 110 }} />
      </div>

      {error && <div className="mi-error">{error}</div>}

      {view === "home" && (
        <div className="mi-home">
          <div className="mi-hero">
            <div className="mi-orb idle">🎙️</div>
            <h2>Practice a real-time voice interview</h2>
            <p>
              An AI interviewer reads your resume, then asks progressively deeper questions
              based on your background. You'll get a scored report — and the recording — at the end.
            </p>

            {usage && (
              <div className="mi-usage-meter" style={{
                margin: "0 auto 14px", maxWidth: 360, padding: "10px 14px",
                border: "1px solid var(--line)", borderRadius: 12,
                background: (usage.available_seconds || 0) <= 0 ? "rgba(220,38,38,0.06)" : "rgba(16,185,129,0.06)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <span>⏱️ Interview balance</span>
                  <strong>{usage.available_minutes} min left</strong>
                </div>
                <div style={{ height: 6, background: "var(--line)", borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, ((usage.available_seconds || 0) / Math.max(1, (usage.allowance_seconds || 0) + (usage.refill_seconds || 0))) * 100)}%`,
                    background: (usage.available_seconds || 0) <= 0 ? "#dc2626" : "#10b981",
                  }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                  {usage.plan_name ? `Plan: ${usage.plan_name}` : "Free trial"}
                  {usage.cycle_end ? ` · resets ${new Date(usage.cycle_end).toLocaleDateString()}` : ""}
                </div>
              </div>
            )}

            {usage && (usage.available_seconds || 0) <= 0 ? (
              <>
                <div className="mi-error" style={{ marginBottom: 10 }}>
                  You're out of interview minutes. Purchase a plan or a refill to continue.
                </div>
                <button className="btn btn-primary mi-start" onClick={() => { setSubTab("refills"); setShowSub(true); }}>
                  Buy more minutes
                </button>
              </>
            ) : (
              <button className="btn btn-primary mi-start" onClick={startInterview}>Start Interview</button>
            )}
            <div className="mi-tip">Tip: use headphones and find a quiet room for the best experience.</div>
          </div>

          <div className="mi-card">
            <h4>Previous Interviews</h4>
            {sessions === null ? (
              <p className="mi-note">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="mi-note">No interviews yet. Your recorded sessions will appear here.</p>
            ) : (
              <div className="mi-session-list">
                {sessions.map((s) => (
                  <button key={s.id} className="mi-session-row" onClick={() => openSession(s)}>
                    <div>
                      <div className="mi-session-title">{s.resume_title || "Interview"}</div>
                      <div className="mi-note">{new Date(s.created_at).toLocaleString()} · {fmtTime(s.duration_seconds || 0)}{s.has_audio ? " · 🎧" : ""}</div>
                    </div>
                    <div className="mi-session-score" style={{ color: scoreColor(s.overall_score ?? 0) }}>
                      {s.overall_score ?? "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === "live" && (
        <div className="mi-live">
          <div className={`mi-orb ${aiSpeaking ? "speaking" : "listening"}`}>🎙️</div>
          <div className="mi-status">{status || "Connecting…"}</div>
          <div className="mi-timer">{fmtTime(elapsed)} <span className="mi-timer-max">/ {fmtTime(capSeconds)}</span></div>
          <div className="mi-controls">
            <button className={`btn ${muted ? "btn-primary" : "btn-ghost"}`} onClick={() => setMuted(m => !m)} disabled={ending}>
              {muted ? "🔇 Unmute" : "🎤 Mute"}
            </button>
            <button className="btn btn-danger mi-end" onClick={endInterview} disabled={ending}>
              {ending ? "Ending…" : "End Interview"}
            </button>
          </div>
          <div className="mi-tip">
            {ending
              ? "Scoring your answers — this takes a few seconds."
              : "Speak naturally. The AI will follow up on your answers — go into detail. Say \"let's wrap up\" whenever you want to finish."}
          </div>
        </div>
      )}

      {view === "report" && (
        <div className="mi-report-wrap">
          <ReportView
            report={activeReport?.report}
            audioUrl={activeReport?.audioUrl}
            durationSeconds={activeReport?.durationSeconds}
          />
          <div className="mi-report-actions">
            <button className="btn btn-ghost" onClick={() => { setActiveReport(null); setView("home"); loadSessions(); loadUsage(); }}>← Previous interviews</button>
            <button className="btn btn-primary" onClick={() => { setActiveReport(null); startInterview(); }}>Start another</button>
          </div>
        </div>
      )}

      {showSub && (
        <SubscriptionModal
          initialTab={subTab}
          onClose={() => setShowSub(false)}
          onSuccess={() => { setShowSub(false); loadUsage(); }}
        />
      )}
    </div>
  );
}
