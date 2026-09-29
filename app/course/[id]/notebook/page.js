"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Shell, { api } from "@/components/Shell";

const ERROR_LABEL = {
  misconception: "Wrong idea",
  missing_prereq: "Missing basics",
  slip: "Careless slip",
  misread: "Misread question",
  no_recall: "Couldn't recall",
  none: "Recall gap",
};

// 错题本: every mistake, why it happened, and the learner's own one-line fix.
function Notebook() {
  const { id } = useParams();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("open");
  const [notes, setNotes] = useState({});
  const [saved, setSaved] = useState({});
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`/api/review?courseId=${id}&notebook=1`)
      .then((d) => {
        setItems(d.items);
        setNotes(Object.fromEntries(d.items.map((x) => [x.id, x.note || ""])));
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  async function saveNote(itemId) {
    await api("/api/review", { method: "POST", body: JSON.stringify({ courseId: id, itemId, action: "note", note: notes[itemId] }) });
    setSaved((s) => ({ ...s, [itemId]: true }));
  }

  if (err) return <div className="error">{err}</div>;
  if (!items) return <p className="center muted" style={{ marginTop: 40 }}><span className="spinner" /></p>;

  const open = items.filter((x) => !x.retired);
  const counts = open.reduce((m, x) => ((m[x.errorType || "none"] = (m[x.errorType || "none"] || 0) + 1), m), {});
  const shown = filter === "open" ? open : filter === "cleared" ? items.filter((x) => x.retired) : open.filter((x) => (x.errorType || "none") === filter);

  return (
    <>
      <p className="muted small" style={{ marginTop: 16 }}>
        Every question you missed. Write the fix in your own words: that is what makes it stick. An item clears after you recall it correctly on 3 separate days.
      </p>
      <div className="chips">
        <button className={`chip ${filter === "open" ? "on" : ""}`} onClick={() => setFilter("open")}>Open ({open.length})</button>
        {Object.entries(counts).map(([k, n]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{ERROR_LABEL[k] || k} ({n})</button>
        ))}
        <button className={`chip ${filter === "cleared" ? "on" : ""}`} onClick={() => setFilter("cleared")}>Cleared ({items.length - open.length})</button>
      </div>
      {shown.length === 0 && <div className="card"><p className="muted small" style={{ margin: 0 }}>Nothing here.</p></div>}
      {shown.map((x) => (
        <div key={x.id} className="card">
          <div className="spread">
            <span className="badge">{ERROR_LABEL[x.errorType || "none"] || x.errorType}</span>
            <span className="small muted">{x.retired ? "Cleared" : `${x.correctDays?.length || 0}/3 days · next ${x.due}`}</span>
          </div>
          <p style={{ margin: "8px 0 4px" }}><b>{x.q}</b></p>
          {x.lastTyped && <p className="small muted" style={{ margin: 0 }}>You wrote: {x.lastTyped}{x.lastConfidence ? ` (${x.lastConfidence})` : ""}</p>}
          <p className="small" style={{ margin: "4px 0" }}>Answer: {x.options[x.answer]}</p>
          {x.diagnosis && <p className="small" style={{ margin: "4px 0" }}><b>Why:</b> {x.diagnosis}</p>}
          <input
            type="text"
            placeholder="My fix, in my own words"
            value={notes[x.id] || ""}
            onChange={(e) => { setNotes((n) => ({ ...n, [x.id]: e.target.value })); setSaved((s) => ({ ...s, [x.id]: false })); }}
            onBlur={() => notes[x.id] !== (x.note || "") && saveNote(x.id)}
            style={{ marginTop: 6 }}
          />
          {saved[x.id] && <p className="small muted" style={{ margin: "4px 0 0" }}>Saved</p>}
        </div>
      ))}
    </>
  );
}

export default function Page() {
  const { id } = useParams();
  return (
    <Shell title="Mistake notebook" back={`/course/${id}`}>
      <Notebook />
    </Shell>
  );
}
