"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Shell, { api } from "@/components/Shell";

// Every button ends with something the learner has to do.
const MORE = [
  { label: "Explain simpler", text: "I lost you. First ask me which part lost me, then re-explain just that part with a smaller step or a concrete case, then give me a one-line check." },
  { label: "Worked example", text: "Show me one fully worked example from the course material with the reason for each step. Then give me a partly completed one to finish." },
  { label: "Analogy", text: "Give me an analogy with a clear mapping (this part = that part) and one line on where it breaks. Then ask me to map one more part myself." },
  { label: "Diagram", text: "Draw this as a simple text diagram with labels next to what they describe. Then give me a version with blank labels to fill in." },
  { label: "Compare", text: "Show a side-by-side contrast of the two ideas in this unit people most often mix up. Then ask me which one applies to a new case." },
  { label: "Quiz me", text: "Ask me one question to check I understand. I will type my answer first, then say sure, unsure, or guess." },
  { label: "Brain dump", text: "Ask me to write everything I remember about this unit in 2 minutes. Then grade it against the key points and tell me which points I missed." },
  { label: "Next concept", text: "I think I have this one. Give me one transfer question first, and if I get it, move to the next concept." },
];
const MEMORY_SUBJECTS = new Set(["language", "memorization", "history"]);
const LEARNED = new Set(["learned", "done", "mastered"]);

function Learn() {
  const { id, unitId } = useParams();
  const [course, setCourse] = useState(null);
  const [status, setStatus] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [attempted, setAttempted] = useState(false);
  const [input, setInput] = useState("");
  const [checkMode, setCheckMode] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef(null);
  const box = useRef(null);

  function loadState() {
    return api(`/api/tutor?courseId=${id}&unitId=${unitId}`)
      .then((d) => {
        setMsgs(d.messages);
        setAttempted(d.attempted);
      })
      .catch(() => {});
  }

  useEffect(() => {
    api(`/api/courses/${id}`)
      .then((d) => {
        setCourse(d.course);
        setStatus(d.myUnits?.[unitId]?.status || null);
      })
      .catch((e) => setErr(e.message));
    loadState();
  }, [id, unitId]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const unit = course?.units.find((u) => u.id === unitId);

  async function send({ text, action, shown }) {
    const t = (text ?? "").trim();
    if (busy || (!t && !action)) return;
    setErr("");
    setBusy(true);
    setShowMore(false);
    const label = shown || t;
    setMsgs((m) => [...m, { role: "user", content: label }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: id, unitId, message: t, action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
      }
      await loadState();
    } catch (e) {
      setErr(e.message);
      setMsgs((m) => m.slice(0, -2));
      if (!action) setInput(t);
    }
    setBusy(false);
  }

  function submitTyped() {
    const t = input.trim();
    if (!t) return;
    setInput("");
    if (checkMode) {
      setCheckMode(false);
      send({ text: t, action: "check", shown: `Check my work:\n${t}` });
    } else send({ text: t });
  }

  async function restart() {
    if (!confirm("Clear this conversation and start the unit over?")) return;
    await api(`/api/tutor?courseId=${id}&unitId=${unitId}`, { method: "DELETE" });
    setMsgs([]);
    setAttempted(false);
  }

  if (err && !course) return <div className="error">{err}</div>;
  if (!unit) return <p className="center muted" style={{ marginTop: 40 }}><span className="spinner" /></p>;

  const learned = LEARNED.has(status);
  const memoryBtn = MEMORY_SUBJECTS.has(course.subjectType)
    ? { label: "Memory trick", text: "Give me a memory trick for the list or facts we're on, tied back to what they mean. Then quiz me on it right away." }
    : { label: "Why is this true?", text: "Ask me why this is true, and let me try to explain before you tell me." };
  const gated = [
    { label: "Exam question", text: "Give me one exam-style question on this unit. Show the marking points only after I answer.", locked: !learned },
    { label: "Summary sheet", text: "Give me a fill-in-the-blank summary of this unit. Show the full sheet after I fill it in.", locked: !learned },
  ];
  const more = [...MORE, memoryBtn, ...gated];

  return (
    <>
      <div className="chat">
        <div className="card" style={{ margin: 0 }}>
          <h3>{unit.title}</h3>
          <p className="muted small" style={{ margin: "0 0 6px" }}>{unit.summary}</p>
          <p className="small" style={{ margin: 0 }}>{unit.concepts.join(" · ")}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <Link href={`/course/${id}/quiz/${unitId}`} className="btn sm">Take unit quiz</Link>
            {msgs.length > 0 && <button className="btn sm ghost" onClick={restart}>Start over</button>}
          </div>
        </div>
        {msgs.length === 0 && (
          <div className="note">
            The tutor will ask you to guess before explaining. Wrong guesses are expected and help you remember. At the end you will explain it back as if teaching your study partner.
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? (m.content ? <ReactMarkdown>{m.content}</ReactMarkdown> : <span className="spinner" />) : m.content}
          </div>
        ))}
        {err && <div className="error">{err}</div>}
        <div ref={end} />
      </div>
      <div className="composer">
        {showMore && (
          <div className="card more-panel">
            <div className="chips">
              {more.map((q) => (
                <button
                  key={q.label}
                  className="chip"
                  disabled={busy || q.locked}
                  title={q.locked ? "Unlocks after you pass the unit quiz" : ""}
                  onClick={() => send({ text: q.text, shown: q.label })}
                >
                  {q.locked ? "🔒 " : ""}{q.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="quick">
          {msgs.length === 0 ? (
            <button className="chip on" disabled={busy} onClick={() => send({ action: "start", shown: "Start lesson" })}>Start lesson</button>
          ) : (
            <>
              <button className="chip" disabled={busy} onClick={() => send({ action: "stuck", shown: "I'm stuck" })}>I'm stuck</button>
              <button className={`chip ${checkMode ? "on" : ""}`} disabled={busy} onClick={() => { setCheckMode(!checkMode); box.current?.focus(); }}>Check my work</button>
              <button className="chip" disabled={busy || !attempted} title={attempted ? "" : "Try the problem once first"} onClick={() => send({ action: "reveal", shown: "Show answer" })}>
                Show answer
              </button>
              <button className="chip" disabled={busy} onClick={() => send({ text: "Let me teach this back. Ask me to explain it in 3 sentences as if to my study partner, in any language, then grade it against the key points.", shown: "Teach it back" })}>
                Teach it back
              </button>
              <button className={`chip ${showMore ? "on" : ""}`} onClick={() => setShowMore(!showMore)}>More</button>
            </>
          )}
        </div>
        <div className="composer-inner">
          <textarea
            ref={box}
            rows={1}
            placeholder={checkMode ? "Type or paste your steps..." : "Answer or ask a question..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitTyped();
              }
            }}
          />
          <button className="btn primary" onClick={submitTyped} disabled={busy || !input.trim()} aria-label="Send">↑</button>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  const { id } = useParams();
  return (
    <Shell title="Tutor" back={`/course/${id}`}>
      <Learn />
    </Shell>
  );
}
