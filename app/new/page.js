"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Shell, { api } from "@/components/Shell";

const MAX_REQ = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB
const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp";

function Chips({ value, onChange, options }) {
  return (
    <div className="chips">
      {Object.entries(options).map(([k, label]) => (
        <button type="button" key={k} className={`chip ${value === k ? "on" : ""}`} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function NewCourse() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", goal: "exam", deadline: "", level: "none", minutesPerDay: 30, language: "both", notes: "", pasted: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const tooBig = files.filter((x) => x.size > MAX_REQ);

  async function submit(e) {
    e.preventDefault();
    if (tooBig.length) return setErr(`Too large to upload: ${tooBig.map((x) => x.name).join(", ")}. Split the PDF or export fewer pages (4 MB max per file).`);
    setErr("");
    // First batch goes with course creation (the plan reads it); the rest is uploaded after.
    const first = [];
    const rest = [];
    let size = 0;
    for (const file of files) {
      if (size + file.size <= MAX_REQ) {
        first.push(file);
        size += file.size;
      } else rest.push(file);
    }
    try {
      setBusy("Reading materials and building your plan. This takes up to a minute...");
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      first.forEach((file) => fd.append("files", file));
      const { id, failed } = await api("/api/courses", { method: "POST", body: fd });
      const allFailed = [...(failed || [])];
      for (const [i, file] of rest.entries()) {
        setBusy(`Uploading more materials (${i + 1}/${rest.length})...`);
        const fd2 = new FormData();
        fd2.append("files", file);
        const r = await api(`/api/courses/${id}/materials`, { method: "POST", body: fd2 });
        allFailed.push(...(r.failed || []));
      }
      if (allFailed.length) alert(`Some files could not be read:\n${allFailed.join("\n")}`);
      router.push(`/course/${id}`);
    } catch (e) {
      setErr(e.message);
      setBusy("");
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>New course</h2>
      <label className="field">
        <span>Course name</span>
        <input type="text" placeholder="e.g. BIO 20A, Statistics, Japanese N4, Python" value={f.name} onChange={set("name")} required />
      </label>
      <label className="field">
        <span>Goal</span>
        <Chips value={f.goal} onChange={set("goal")} options={{ exam: "Pass the exam", understand: "Really understand", apply: "Use it in a project" }} />
      </label>
      <label className="field">
        <span>Deadline or exam date</span>
        <input type="date" value={f.deadline} onChange={set("deadline")} />
      </label>
      <label className="field">
        <span>Starting level</span>
        <Chips value={f.level} onChange={set("level")} options={{ none: "From zero", unsure: "Not sure", some: "Some basics", rusty: "Rusty" }} />
      </label>
      <label className="field">
        <span>Minutes per day</span>
        <Chips value={String(f.minutesPerDay)} onChange={set("minutesPerDay")} options={{ 15: "15", 30: "30", 60: "60", 90: "90+" }} />
      </label>
      <label className="field">
        <span>Tutor language</span>
        <Chips value={f.language} onChange={set("language")} options={{ both: "中文 + English terms", en: "English", zh: "中文" }} />
      </label>
      <label className="field">
        <span>Course materials</span>
        <input type="file" multiple accept={ACCEPT} onChange={(e) => setFiles([...e.target.files])} />
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Syllabus, lecture slides, notes, past exams. PDF, PowerPoint, Word, text, or photos of slides. You can add more later.
        </p>
        {files.length > 0 && (
          <p className="small" style={{ margin: "6px 0 0" }}>
            {files.length} file{files.length > 1 ? "s" : ""}, {(files.reduce((a, x) => a + x.size, 0) / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
      </label>
      <label className="field">
        <span>Or paste text (optional)</span>
        <textarea placeholder="Paste the syllabus or topic list" value={f.pasted} onChange={set("pasted")} />
      </label>
      <label className="field">
        <span>Anything the tutor should know (optional)</span>
        <input type="text" placeholder="e.g. missed the first two weeks, midterm covers ch. 1 to 5" value={f.notes} onChange={set("notes")} />
      </label>
      {err && <div className="error">{err}</div>}
      {busy && <div className="note"><span className="spinner" /> {busy}</div>}
      <button className="btn primary block" disabled={!!busy}>Build my plan</button>
    </form>
  );
}

export default function Page() {
  return (
    <Shell title="New course" back="/">
      <NewCourse />
    </Shell>
  );
}
