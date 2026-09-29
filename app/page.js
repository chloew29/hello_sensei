"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell, { api, useMe } from "@/components/Shell";

const GOAL_LABEL = { exam: "Pass exam", understand: "Understand", apply: "Apply" };

function Home() {
  const me = useMe();
  const [courses, setCourses] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/courses").then((d) => setCourses(d.courses)).catch((e) => setErr(e.message));
  }, []);

  return (
    <>
      <div className="spread" style={{ marginTop: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Konnichiwa, {me.learner}! 🌸</h2>
          <p className="muted small" style={{ margin: 0 }}>Choose your dojo, deshi.</p>
        </div>
        <Link href="/new" className="btn primary">+ New dojo</Link>
      </div>
      {err && <div className="error">{err}</div>}
      {courses === null && !err && <p className="center muted"><span className="spinner" /></p>}
      {courses?.length === 0 && (
        <div className="card">
          <h3>The dojo is empty 🍃</h3>
          <p className="muted small">Add a course with its syllabus or slides. Sensei will forge your training plan from zero, and you both shall train.</p>
        </div>
      )}
      {courses?.map((c) => {
        const pct = c.mine.total ? Math.round((c.mine.done / c.mine.total) * 100) : 0;
        return (
          <Link key={c.id} href={`/course/${c.id}`} className="card link">
            <div className="spread">
              <h3>{c.name}</h3>
              <span className="badge">{GOAL_LABEL[c.goal]}</span>
            </div>
            <p className="muted small" style={{ margin: "2px 0 10px" }}>
              {c.mine.done}/{c.mine.total} units
              {c.deadline ? ` · due ${c.deadline}` : ""}
              {c.mine.due ? ` · ${c.mine.due} to review` : ""}
            </p>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          </Link>
        );
      })}
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <Home />
    </Shell>
  );
}
