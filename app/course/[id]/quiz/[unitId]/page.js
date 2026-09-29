"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell, { api } from "@/components/Shell";
import QuestionCard from "@/components/QuestionCard";

function Quiz() {
  const { id, unitId } = useParams();
  const [data, setData] = useState(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    setData(null);
    setErr("");
    setI(0);
    setAnswers([]);
    setResult(null);
    api("/api/quiz", { method: "POST", body: JSON.stringify({ courseId: id, unitId }) })
      .then(setData)
      .catch((e) => setErr(e.message));
  }
  useEffect(load, [id, unitId]);

  async function submit(all) {
    setSubmitting(true);
    try {
      const r = await api("/api/quiz/submit", {
        method: "POST",
        body: JSON.stringify({
          courseId: id,
          unitId,
          delayedCheck: data.delayedCheck,
          results: data.questions.map((q, k) => ({ ...q, ...all[k] })),
        }),
      });
      setResult(r);
    } catch (e) {
      setErr(e.message);
    }
    setSubmitting(false);
  }

  if (err) return (<><div className="error">{err}</div><button className="btn" onClick={load}>Try again</button></>);
  if (!data) return <div className="note" style={{ marginTop: 24 }}><span className="spinner" /> Writing and checking your quiz against the course materials...</div>;
  if (submitting) return <div className="note" style={{ marginTop: 24 }}><span className="spinner" /> Grading your typed answers...</div>;

  const qs = data.questions;
  if (result) {
    const missed = qs.map((q, k) => ({ q, a: answers[k], g: result.grades[k] })).filter((x) => x.a.chosen !== x.q.answer || !x.g.typedCorrect);
    return (
      <>
        <div className="card center" style={{ marginTop: 24 }}>
          <p className="muted small" style={{ margin: 0 }}>{data.title}</p>
          <div className="row" style={{ justifyContent: "center", gap: 28, margin: "8px 0" }}>
            <div><div className="stat" style={{ fontSize: 34 }}>{result.recalled}/{result.total}</div><div className="small muted">recalled from memory</div></div>
            <div><div className="stat" style={{ fontSize: 34 }}>{result.score}/{result.total}</div><div className="small muted">picked correctly</div></div>
          </div>
          <p>{result.message}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href={`/course/${id}`} className="btn primary">Back to course</Link>
            {unitId !== "diagnostic" && !["learned", "mastered"].includes(result.status) && <Link href={`/course/${id}/learn/${unitId}`} className="btn">Work on it with the tutor</Link>}
          </div>
        </div>
        {missed.length > 0 && <h2>To review</h2>}
        {missed.map(({ q, a, g }, k) => (
          <div key={k} className="card">
            <p style={{ marginTop: 0 }}><b>{q.q}</b></p>
            <p className="small">Answer: {q.options[q.answer]}</p>
            {a.typed && <p className="small muted">You wrote: {a.typed}{g.typedCorrect ? " (counted as recalled)" : ""}</p>}
            {g.diagnosis && <p className="small"><b>What went wrong:</b> {g.diagnosis}</p>}
            <div className="explain">{q.explanation}</div>
          </div>
        ))}
        <p className="muted small">Every question from this quiz is now in your review schedule, timed to your exam date. Mistakes also go into your mistake notebook.</p>
      </>
    );
  }

  const q = qs[i];
  return (
    <div style={{ marginTop: 16 }}>
      <div className="spread small muted">
        <span>{data.title}</span>
        <span>{i + 1} / {qs.length}</span>
      </div>
      <div className="bar" style={{ margin: "8px 0 16px" }}><i style={{ width: `${(i / qs.length) * 100}%` }} /></div>
      {data.delayedCheck && i === 0 && <div className="note">Mastery check: no tutor, no notes. This shows whether it stuck.</div>}
      <QuestionCard
        key={i}
        q={q}
        nextLabel={i < qs.length - 1 ? "Next" : "See results"}
        onAnswer={async (a) => setAnswers((prev) => { const n = [...prev]; n[i] = a; return n; })}
        onNext={() => {
          if (i < qs.length - 1) setI(i + 1);
          else submit(answers);
        }}
      />
    </div>
  );
}

export default function Page() {
  const { id } = useParams();
  return (
    <Shell title="Quiz" back={`/course/${id}`}>
      <Quiz />
    </Shell>
  );
}
