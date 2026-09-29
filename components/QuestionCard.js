"use client";
import { useState } from "react";

// Typed recall first, then a confidence tap, then the options. Recall beats recognition,
// and confidence lets the app retest confident mistakes sooner.
export default function QuestionCard({ q, onAnswer, onNext, nextLabel = "Next", extra }) {
  const [stage, setStage] = useState("type"); // type -> confidence -> pick -> done
  const [typed, setTyped] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [chosen, setChosen] = useState(undefined);
  const [busy, setBusy] = useState(false);

  async function pick(k) {
    setChosen(k);
    setStage("done");
    setBusy(true);
    try {
      await onAnswer({ typed, confidence, chosen: k });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 18, lineHeight: 1.4 }}>{q.q}</h3>

      {stage === "type" && (
        <div className="typed">
          <textarea
            autoFocus
            placeholder="Type your answer from memory first (any language)"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            style={{ minHeight: 70 }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={!typed.trim()} onClick={() => setStage("confidence")}>Submit</button>
            <button className="btn ghost sm" onClick={() => { setTyped(""); setStage("confidence"); }}>I don't know</button>
          </div>
          <p className="muted small">Recalling it yourself makes it stick far better than picking from options.</p>
        </div>
      )}

      {stage === "confidence" && (
        <div>
          {typed && <p className="small muted">You wrote: {typed}</p>}
          <p className="small" style={{ marginBottom: 0 }}>How sure are you?</p>
          <div className="conf">
            {["sure", "unsure", "guess"].map((c) => (
              <button key={c} className="chip" onClick={() => { setConfidence(c); setStage("pick"); }}>
                {c === "sure" ? "Sure" : c === "unsure" ? "Unsure" : "Guess"}
              </button>
            ))}
          </div>
        </div>
      )}

      {(stage === "pick" || stage === "done") && (
        <>
          {typed && <p className="small muted" style={{ marginTop: 0 }}>You wrote: {typed}</p>}
          <p className="small" style={{ margin: "0 0 4px" }}>Now pick the best match:</p>
          {q.options.map((o, k) => {
            let cls = "opt";
            if (stage === "done" && k === q.answer) cls += " right";
            else if (stage === "done" && k === chosen) cls += " wrong";
            return (
              <button key={k} className={cls} disabled={stage === "done"} onClick={() => pick(k)}>
                <b>{String.fromCharCode(65 + k)}.</b> {o}
              </button>
            );
          })}
        </>
      )}

      {stage === "done" && (
        <>
          <div className="explain">
            <b>{chosen === q.answer ? (confidence === "sure" ? "Correct." : "Correct, and now you know why:") : confidence === "sure" ? "Not quite, and you felt sure, so this one comes back soon." : "Not quite."}</b> {q.explanation}
          </div>
          {extra}
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy} onClick={onNext}>
            {busy ? "Saving..." : nextLabel}
          </button>
        </>
      )}
    </div>
  );
}
