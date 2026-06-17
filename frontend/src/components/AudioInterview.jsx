import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "../api/client";

/**
 * AI Audio Interview — the AI conducts the interview:
 * 1. AI speaks the question aloud
 * 2. Automatically starts listening for user's voice answer
 * 3. User speaks — transcription happens live
 * 4. User clicks "Submit Answer" (or silence timeout)
 * 5. AI scores the answer
 * 6. Moves to next question
 * 7. After all questions → full report
 */

const PHASE = { READY: "ready", ASKING: "asking", LISTENING: "listening", SCORING: "scoring", SCORED: "scored", DONE: "done" };

export default function AudioInterview({ content, questions, role, onExit }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState(PHASE.READY);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [results, setResults] = useState([]);  // {question, answer, rating}
  const [error, setError] = useState("");
  const [silenceTimer, setSilenceTimer] = useState(null);

  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");

  const currentQ = questions[currentIdx];
  const isLastQ = currentIdx >= questions.length - 1;
  const totalAnswered = results.length;
  const avgScore = totalAnswered > 0 ? Math.round(results.reduce((s, r) => s + (r.rating?.score || 0), 0) / totalAnswered) : 0;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.abort();
      if (silenceTimer) clearTimeout(silenceTimer);
    };
  }, []);

  // ---- Step 1: AI speaks the question ----
  const askQuestion = useCallback(() => {
    setPhase(PHASE.ASKING);
    setTranscript("");
    setInterimText("");
    transcriptRef.current = "";
    setError("");

    if (!window.speechSynthesis) {
      setError("Text-to-Speech not supported. Use Chrome.");
      setPhase(PHASE.LISTENING);
      startListening();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQ.question);
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.lang = "en-IN";

    // Pick a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google")) ||
                      voices.find(v => v.lang.startsWith("en-") && !v.name.includes("espeak")) ||
                      voices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      // After AI finishes speaking, start listening
      setTimeout(() => startListening(), 500);
    };
    utterance.onerror = () => {
      setPhase(PHASE.LISTENING);
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  }, [currentIdx, currentQ]);

  // ---- Step 2: Listen to user's voice answer ----
  const startListening = useCallback(() => {
    setPhase(PHASE.LISTENING);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech Recognition not supported. Please use Google Chrome.");
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim = event.results[i][0].transcript;
        }
      }
      transcriptRef.current = final;
      setTranscript(final);
      setInterimText(interim);

      // Reset silence timer on every speech
      if (silenceTimer) clearTimeout(silenceTimer);
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Microphone error: ${e.error}. Check browser permissions.`);
      }
    };

    recognition.onend = () => {
      // Speech recognition ended (browser may auto-stop after silence)
      // If we have transcript, it's fine — user can submit
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [silenceTimer]);

  // ---- Step 3: User submits answer ----
  const submitAnswer = async () => {
    // Stop listening
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    const answer = transcriptRef.current.trim() || transcript.trim();
    if (!answer) {
      setError("No answer detected. Please speak your answer and try again.");
      return;
    }

    setPhase(PHASE.SCORING);
    setError("");

    try {
      const rating = await api.rateAnswer(content, currentQ.question, answer, role);
      const result = { question: currentQ, answer, rating };
      setResults(prev => [...prev, result]);
      setPhase(PHASE.SCORED);

      // Speak the score feedback
      if (window.speechSynthesis) {
        const feedback = `You scored ${rating.score} out of 100. ${rating.rating}.`;
        const u = new SpeechSynthesisUtterance(feedback);
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      setError("Scoring failed: " + e.message);
      setPhase(PHASE.LISTENING);
    }
  };

  // ---- Step 4: Move to next question ----
  const nextQuestion = () => {
    if (isLastQ) {
      setPhase(PHASE.DONE);
      return;
    }
    setCurrentIdx(prev => prev + 1);
    setTimeout(() => askQuestion(), 600);
  };

  // ---- Skip question ----
  const skipQuestion = () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    const result = { question: currentQ, answer: "(skipped)", rating: { score: 0, rating: "Skipped", strengths: [], gaps: ["Question was skipped."] } };
    setResults(prev => [...prev, result]);
    if (isLastQ) { setPhase(PHASE.DONE); return; }
    setCurrentIdx(prev => prev + 1);
    setTimeout(() => askQuestion(), 600);
  };

  // ---- Re-record answer ----
  const reRecord = () => {
    recognitionRef.current?.stop();
    setTranscript("");
    setInterimText("");
    transcriptRef.current = "";
    startListening();
  };

  // ---- Render: READY state ----
  if (phase === PHASE.READY) {
    return (
      <div className="audio-interview">
        <div className="ai-interviewer-intro">
          <div className="ai-avatar">🤖</div>
          <h3>AI Interview — Voice Mode</h3>
          <p>I'll ask you <strong>{questions.length} questions</strong> for the <strong>{role}</strong> position.
            I'll speak each question aloud, then listen to your spoken answer. After each answer, I'll score it instantly.</p>
          <div className="ai-tips">
            <p><strong>Tips for best results:</strong></p>
            <ul>
              <li>Use <strong>Google Chrome</strong> (required for speech recognition)</li>
              <li>Allow microphone access when prompted</li>
              <li>Speak clearly at a normal pace</li>
              <li>Use the STAR method: Situation → Task → Action → Result</li>
              <li>Include specific numbers and metrics</li>
            </ul>
          </div>
          <button className="btn btn-primary btn-lg" onClick={askQuestion} style={{ width: "100%", marginTop: 16 }}>
            🎙️ Start Interview
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onExit} style={{ width: "100%", marginTop: 8 }}>
            ← Back to text mode
          </button>
        </div>
      </div>
    );
  }

  // ---- Render: DONE state — Full Report ----
  if (phase === PHASE.DONE) {
    const answered = results.filter(r => r.answer !== "(skipped)");
    const skipped = results.filter(r => r.answer === "(skipped)");
    const totalScore = answered.length > 0 ? Math.round(answered.reduce((s, r) => s + (r.rating?.score || 0), 0) / answered.length) : 0;
    const excellent = answered.filter(r => r.rating?.score >= 85).length;
    const good = answered.filter(r => r.rating?.score >= 70 && r.rating?.score < 85).length;
    const needsWork = answered.filter(r => r.rating?.score < 70).length;

    return (
      <div className="audio-interview">
        <div className="interview-report-full">
          <div className="report-header">
            <div className="ai-avatar">📊</div>
            <h3>Interview Report — {role}</h3>
          </div>

          <div className="report-summary">
            <div className="report-score-big">
              <div className={`score-circle ${totalScore >= 80 ? "good" : totalScore >= 60 ? "ok" : "weak"}`}>
                {totalScore}
              </div>
              <div className="score-label">Overall Score</div>
            </div>
            <div className="report-stats">
              <div className="rstat"><span className="rstat-num">{answered.length}</span> Answered</div>
              <div className="rstat"><span className="rstat-num">{skipped.length}</span> Skipped</div>
              <div className="rstat good"><span className="rstat-num">{excellent}</span> Excellent (85+)</div>
              <div className="rstat ok"><span className="rstat-num">{good}</span> Good (70-84)</div>
              <div className="rstat weak"><span className="rstat-num">{needsWork}</span> Needs Work (&lt;70)</div>
            </div>
          </div>

          <h4 style={{ marginTop: 20 }}>Question-by-Question Breakdown</h4>
          {results.map((r, i) => (
            <div key={i} className={`report-q ${r.answer === "(skipped)" ? "skipped" : ""}`}>
              <div className="report-q-head">
                <span className={`q-type ${r.question.type}`}>{r.question.category || r.question.type}</span>
                <span className={`score-badge ${(r.rating?.score || 0) >= 80 ? "good" : (r.rating?.score || 0) >= 60 ? "ok" : "weak"}`}>
                  {r.rating?.score || 0}/100
                </span>
              </div>
              <p className="report-q-text"><strong>Q:</strong> {r.question.question}</p>
              {r.answer !== "(skipped)" && (
                <>
                  <p className="report-a-text"><strong>Your answer:</strong> {r.answer}</p>
                  {r.rating?.strengths?.length > 0 && (
                    <div className="report-feedback">
                      <strong className="ai-good">Strengths:</strong>
                      <ul>{r.rating.strengths.map((s, j) => <li key={j}>{s}</li>)}</ul>
                    </div>
                  )}
                  {r.rating?.gaps?.length > 0 && (
                    <div className="report-feedback">
                      <strong className="ai-warn">Areas to improve:</strong>
                      <ul>{r.rating.gaps.map((g, j) => <li key={j}>{g}</li>)}</ul>
                    </div>
                  )}
                  {r.rating?.suggested_answer && (
                    <div className="suggested-answer"><strong>Ideal answer:</strong><p>{r.rating.suggested_answer}</p></div>
                  )}
                </>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn btn-primary" onClick={() => { setResults([]); setCurrentIdx(0); setPhase(PHASE.READY); }} style={{ flex: 1 }}>
              🔄 Retake Interview
            </button>
            <button className="btn btn-ghost" onClick={onExit} style={{ flex: 1 }}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: Active interview (ASKING / LISTENING / SCORING / SCORED) ----
  return (
    <div className="audio-interview">
      {/* Progress bar */}
      <div className="ai-progress">
        <div className="ai-progress-bar" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="ai-progress-text">
        Question {currentIdx + 1} of {questions.length} · Score so far: {avgScore}/100
      </div>

      {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}

      {/* Question card */}
      <div className="ai-question-card">
        <div className="q-header">
          <span className={`q-type ${currentQ.type}`}>{currentQ.category || currentQ.type}</span>
          <span className="q-num">Q{currentIdx + 1}</span>
        </div>
        <p className="ai-q-text">{currentQ.question}</p>
        {currentQ.tips && <p className="q-tips">💡 {currentQ.tips}</p>}
      </div>

      {/* Phase indicators */}
      {phase === PHASE.ASKING && (
        <div className="ai-phase asking">
          <div className="phase-icon">🔊</div>
          <div className="phase-text">AI is asking the question…</div>
          <div className="sound-wave"><span /><span /><span /><span /><span /></div>
        </div>
      )}

      {phase === PHASE.LISTENING && (
        <div className="ai-phase listening">
          <div className="phase-icon">🎙️</div>
          <div className="phase-text">Listening to your answer… Speak now.</div>
          <div className="sound-wave recording"><span /><span /><span /><span /><span /></div>

          {/* Live transcript */}
          <div className="live-transcript">
            {transcript && <span className="final-text">{transcript}</span>}
            {interimText && <span className="interim-text">{interimText}</span>}
            {!transcript && !interimText && <span className="placeholder-text">Your answer will appear here as you speak…</span>}
          </div>

          <div className="listening-actions">
            <button className="btn btn-primary" onClick={submitAnswer} disabled={!transcript.trim()}>
              ✓ Submit Answer
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reRecord}>🔄 Re-record</button>
            <button className="btn btn-ghost btn-sm" onClick={skipQuestion}>⏭ Skip</button>
          </div>
        </div>
      )}

      {phase === PHASE.SCORING && (
        <div className="ai-phase scoring">
          <div className="phase-icon">⏳</div>
          <div className="phase-text">AI is analyzing your answer…</div>
        </div>
      )}

      {phase === PHASE.SCORED && results.length > 0 && (
        <div className="ai-phase scored">
          {(() => {
            const latest = results[results.length - 1];
            return (
              <>
                <div className="rating-score" style={{ justifyContent: "center", marginBottom: 12 }}>
                  <span className={`score-badge big ${latest.rating?.score >= 80 ? "good" : latest.rating?.score >= 60 ? "ok" : "weak"}`}>
                    {latest.rating?.score}/100
                  </span>
                  <span className="rating-label">{latest.rating?.rating}</span>
                </div>

                <p className="scored-answer"><strong>Your answer:</strong> {latest.answer}</p>

                {latest.rating?.strengths?.length > 0 && (
                  <div><strong className="ai-good">✓ Strengths:</strong>
                    <ul>{latest.rating.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {latest.rating?.gaps?.length > 0 && (
                  <div><strong className="ai-warn">⚠ Improve:</strong>
                    <ul>{latest.rating.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                  </div>
                )}

                <button className="btn btn-primary" onClick={nextQuestion} style={{ width: "100%", marginTop: 14 }}>
                  {isLastQ ? "📊 View Full Report" : `Next Question (${currentIdx + 2}/${questions.length}) →`}
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
