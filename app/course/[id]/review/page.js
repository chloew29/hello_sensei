"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell, { api } from "@/components/Shell";
import QuestionCard from "@/components/QuestionCard";

function Review() {
  const { id } = useParams();
  const [items, setItems] = useState(null);
  const [i, setI] = useState(0);
  const [res, setRes] = useState(null);
  const [right, setRight] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`/api/review?courseId=${id}`).then((d) => setItems(d.due)).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="error">{err}</div>;
  if (!items) return <p className="center muted" style={{ marginTop: 40 }}><span className="spinner" /></p>;
  if (!items.length || i >= items.length)
    return (
      <div className="card center" style={{ marginTop: 24 }}>
        <h3>{items.length ? `Done: ${right}/${items.length} recalled` : "Nothing due today"}</h3>
        <p className="muted small">Misses come back tomorrow, confident misses sooner. Each item clears after you recall it on 3 separate days, and everything gets one more look 2 days before the exam.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href={`/course/${id}`} className="btn primary">Back to course</Link>
          <Link href={`/course/${id}/notebook`} className="btn">Mistake notebook</Link>
        </div>
      </div>
    );

  const q = items[i];
  return (
    <div style={{ marginTop: 16 }}>
      <div className="spread small muted">
        <span>Review · {q.concept}</span>
        <span>{i + 1} / {items.length}</span>
      </div>
      <div className="bar" style={{ margin: "8px 0 16px" }}><i style={{ width: `${(i / items.length) * 100}%` }} /></div>
      <QuestionCard
        key={q.id}
        q={q}
        onAnswer={async (a) => {
          const r = await api("/api/review", { method: "POST", body: JSON.stringify({ courseId: id, itemId: q.id, ...a }) });
          if (r.typedCorrect && a.chosen === q.answer) setRight((n) => n + 1);
          setRes(r);
        }}
        extra={
          res && (
            <p className="small" style={{ marginBottom: 0 }}>
              {res.typedCorrect ? "Recalled from memory." : "Your typed answer missed the key idea."}
              {res.diagnosis ? ` ${res.diagnosis}` : ""}
              {res.retired ? " Cleared: recalled on 3 separate days." : res.correctDays ? ` Recalled on ${res.correctDays} of 3 days needed.` : ""}
            </p>
          )
        }
        onNext={() => {
          setRes(null);
          setI(i + 1);
        }}
      />
    </div>
  );
}

export default function Page() {
  const { id } = useParams();
  return (
    <Shell title="Review" back={`/course/${id}`}>
      <Review />
    </Shell>
  );
}
