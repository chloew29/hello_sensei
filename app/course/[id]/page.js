"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Shell, { api } from "@/components/Shell";

const today = () => new Date().toISOString().slice(0, 10);

function Course() {
  const { id } = useParams();
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [upload, setUpload] = useState("");
  const [label, setLabel] = useState("");
  const [extend, setExtend] = useState(true);

  const load = useCallback(() => {
    api(`/api/courses/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (err) return <div className="error">{err}</div>;
  if (!d) return <p className="center muted" style={{ marginTop: 40 }}><span className="spinner" /></p>;

  const { course, board, myUnits, mySummary } = d;
  const DONE = ["learned", "mastered", "done"];
  const next = course.units.find((u) => !DONE.includes(myUnits[u.id]?.status));
  const checks = course.units.filter((u) => (mySummary.checks || []).includes(u.id));
  const started = board.find((b) => b.name === d.learner)?.last?.length > 0 || Object.keys(myUnits).length > 0;

  async function addMaterials(e) {
    const files = [...e.target.files];
    if (!files.length) return;
    const failed = [];
    const added = [];
    for (const [i, file] of files.entries()) {
      if (file.size > 4 * 1024 * 1024) {
        failed.push(`${file.name} (over 4 MB)`);
        continue;
      }
      setUpload(`Reading ${i + 1}/${files.length}...`);
      const fd = new FormData();
      fd.append("files", file);
      try {
        const r = await api(`/api/courses/${id}/materials`, { method: "POST", body: fd });
        failed.push(...(r.failed || []));
        added.push(...(r.added || []));
      } catch (e) {
        failed.push(`${file.name} (${e.message})`);
      }
    }
    e.target.value = "";
    let msg = added.length ? "Added. The tutor and quizzes use them from now on." : "";
    if (added.length && extend) {
      setUpload("Checking for new topics to add to the plan...");
      try {
        const r = await api(`/api/courses/${id}/extend`, { method: "POST", body: JSON.stringify({ sources: added, label }) });
        msg = r.added.length ? `${r.note} New: ${r.added.join(", ")}.` : "Added. These topics were already in the plan.";
      } catch (e) {
        msg = `Added, but the plan was not updated: ${e.message}`;
      }
    }
    if (failed.length) msg += ` Could not read: ${failed.join(", ")}`;
    setUpload(msg.trim());
    setLabel("");
    load();
  }

  async function remove() {
    if (!confirm(`Delete ${course.name} and everyone's progress in it?`)) return;
    await api(`/api/courses/${id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <>
      <p className="muted small" style={{ marginTop: 16 }}>{course.overview}</p>

      {!started && (
        <div className="card">
          <h3>Start with a quick diagnostic</h3>
          <p className="muted small">8 questions to find what you already know. Wrong answers go into your review queue.</p>
          <Link href={`/course/${id}/quiz/diagnostic`} className="btn primary">Take diagnostic</Link>
        </div>
      )}

      {next ? (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>Up next</p>
          <h3>{next.title}</h3>
          <p className="muted small">{next.summary}</p>
          <div className="row">
            <Link href={`/course/${id}/learn/${next.id}`} className="btn primary">Learn with tutor</Link>
            <Link href={`/course/${id}/quiz/${next.id}`} className="btn">Unit quiz</Link>
          </div>
        </div>
      ) : (
        <div className="card"><h3>All units done</h3><p className="muted small">Keep up your reviews until the deadline.</p></div>
      )}

      {checks.map((u) => (
        <Link key={u.id} href={`/course/${id}/quiz/${u.id}`} className="card link">
          <div className="spread">
            <div>
              <h3>Mastery check: {u.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>You learned this a few days ago. Pass again without help to master it.</p>
            </div>
            <span className="btn sm primary">Start</span>
          </div>
        </Link>
      ))}

      {mySummary.due > 0 && (
        <Link href={`/course/${id}/review`} className="card link">
          <div className="spread">
            <div>
              <h3>Review</h3>
              <p className="muted small" style={{ margin: 0 }}>{mySummary.due} question{mySummary.due > 1 ? "s" : ""} due today</p>
            </div>
            <span className="btn sm primary">Start</span>
          </div>
        </Link>
      )}

      {mySummary.notebook > 0 && (
        <Link href={`/course/${id}/notebook`} className="card link">
          <div className="spread">
            <div>
              <h3>Mistake notebook</h3>
              <p className="muted small" style={{ margin: 0 }}>{mySummary.notebook} open. Write each fix in your own words.</p>
            </div>
            <span className="btn sm">Open</span>
          </div>
        </Link>
      )}

      <h2>Progress</h2>
      <div className="board">
        {board.map((b) => (
          <div key={b.name} className="card">
            <div className="spread">
              <h3>{b.name}{b.name === d.learner ? " (you)" : ""}</h3>
              {b.streak > 0 && <span className="badge done">{b.streak} day streak</span>}
            </div>
            <div className="row" style={{ gap: 20 }}>
              <div><div className="stat">{b.mastered || 0}</div><div className="small muted">mastered</div></div>
              <div><div className="stat">{b.done}/{b.total}</div><div className="small muted">learned</div></div>
            </div>
            <div className="bar" style={{ margin: "6px 0 8px" }}><i style={{ width: `${b.total ? (b.done / b.total) * 100 : 0}%` }} /></div>
            <p className="muted small" style={{ margin: 0 }}>
              {b.last.length ? `Last quiz ${b.last[b.last.length - 1].recalled ?? "?"}/${b.last[b.last.length - 1].total} recalled` : "No quizzes yet"}
              {b.due ? ` · ${b.due} to review` : ""}
            </p>
            {b.shaky.length > 0 && <p className="small" style={{ margin: "6px 0 0" }}>Shaky: {b.shaky.slice(0, 4).join(", ")}</p>}
          </div>
        ))}
      </div>

      <h2>Plan</h2>
      {course.units.map((u, i) => {
        const s = myUnits[u.id];
        const isDone = DONE.includes(s?.status);
        const late = !isDone && u.targetDate < today();
        const badge = !s ? null : s.status === "mastered" ? "mastered" : isDone ? `learned ${s.best}%` : "in progress";
        return (
          <div key={u.id} className="card">
            <div className="unit" onClick={() => setOpen(open === u.id ? null : u.id)} style={{ cursor: "pointer" }}>
              <div className={`n ${isDone ? "done" : ""}`}>{s?.status === "mastered" ? "★" : isDone ? "✓" : i + 1}</div>
              <div>
                <div className="spread">
                  <h3>{u.title}</h3>
                  {badge && <span className={`badge ${isDone ? "done" : "learning"}`}>{badge}</span>}
                </div>
                <p className={`small ${late ? "badge late" : "muted"}`} style={{ margin: 0, padding: 0, background: "none" }}>
                  by {u.targetDate}{late ? " (behind)" : ""}
                </p>
              </div>
            </div>
            {open === u.id && (
              <div style={{ marginTop: 10 }}>
                <p className="small muted">{u.summary}</p>
                <ul className="small" style={{ paddingLeft: 20 }}>
                  {u.concepts.map((c) => <li key={c}>{c}</li>)}
                </ul>
                <div className="row">
                  <Link href={`/course/${id}/learn/${u.id}`} className="btn sm primary">Learn</Link>
                  <Link href={`/course/${id}/quiz/${u.id}`} className="btn sm">Quiz</Link>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <h2>Materials</h2>
      <div className="card">
        <p className="small" style={{ marginTop: 0 }}>
          {course.materialSources?.length ? course.materialSources.join(", ") : "None yet. The tutor is teaching from general knowledge."}
        </p>
        <p className="small muted">Each week, add what the teacher gives you: slides, handouts, photos of the board, practice exams.</p>
        <input type="text" placeholder="Label, e.g. Week 3 lecture (optional)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ marginBottom: 10 }} />
        <label className="row small" style={{ marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} />
          Add any new topics to the plan
        </label>
        <label className="btn sm primary">
          + Add slides or notes
          <input type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={addMaterials} hidden />
        </label>
        {upload && <p className="small">{upload}</p>}
      </div>

      <div style={{ marginTop: 32 }}>
        <button className="btn ghost sm danger" onClick={remove}>Delete course</button>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell title="Course" back="/">
      <Course />
    </Shell>
  );
}
