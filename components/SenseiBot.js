"use client";
import { useEffect, useState } from "react";
import { api } from "./Shell";

export default function SenseiBot() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("note");
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [trText, setTrText] = useState("");
  const [trTarget, setTrTarget] = useState("zh");
  const [trResult, setTrResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open && tab === "note") {
      api("/api/bot")
        .then((d) => setNotes(d.notes || []))
        .catch(() => {});
    }
  }, [open, tab]);

  async function saveNote() {
    if (!noteText.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const d = await api("/api/bot", {
        method: "POST",
        body: JSON.stringify({ action: "note", text: noteText }),
      });
      setNotes(d.notes || []);
      setNoteText("");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  async function delNote(id) {
    try {
      const d = await api("/api/bot", { method: "DELETE", body: JSON.stringify({ id }) });
      setNotes(d.notes || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function translate() {
    if (!trText.trim() || busy) return;
    setBusy(true);
    setErr("");
    setTrResult("");
    try {
      const d = await api("/api/bot", {
        method: "POST",
        body: JSON.stringify({ action: "translate", text: trText, target: trTarget }),
      });
      setTrResult(d.result || "");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <button className="sensei-fab" onClick={() => setOpen((o) => !o)} title="Sakura-chan: notes & translation 🌸" aria-label="Open Sakura-chan">
        <img src="/sensei-chan.png" alt="Sakura-chan" />
      </button>
      {open && (
        <div className="sensei-panel">
          <div className="sensei-head">
            <img src="/sensei-chan.png" alt="Sakura-chan" />
            <div>
              <b>Sakura-chan 🌸</b>
              <small>随时帮你记笔记、翻译~</small>
            </div>
          </div>
          <div className="sensei-tabs">
            <button className={`chip ${tab === "note" ? "on" : ""}`} onClick={() => setTab("note")}>
              📝 记笔记
            </button>
            <button className={`chip ${tab === "translate" ? "on" : ""}`} onClick={() => setTab("translate")}>
              🌐 翻译
            </button>
          </div>
          <div className="sensei-body">
            {err && <div className="error">{err}</div>}
            {tab === "note" && (
              <>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="随手记点什么…灵感、单词、待办~"
                />
                <button className="btn primary sm block" onClick={saveNote} disabled={busy || !noteText.trim()} style={{ marginTop: 8 }}>
                  {busy ? "记下来啦…" : "✍️ 记下来"}
                </button>
                {notes.map((n) => (
                  <div key={n.id} className="sensei-note">
                    <p>
                      {n.text}
                      <time>{new Date(n.at).toLocaleString()}</time>
                    </p>
                    <button onClick={() => delNote(n.id)} title="删除">
                      ×
                    </button>
                  </div>
                ))}
              </>
            )}
            {tab === "translate" && (
              <>
                <textarea
                  value={trText}
                  onChange={(e) => setTrText(e.target.value)}
                  placeholder="粘贴要翻译的文字…中英互译~"
                />
                <div className="chips" style={{ margin: "8px 0" }}>
                  <button className={`chip ${trTarget === "zh" ? "on" : ""}`} onClick={() => setTrTarget("zh")}>
                    → 中文
                  </button>
                  <button className={`chip ${trTarget === "en" ? "on" : ""}`} onClick={() => setTrTarget("en")}>
                    → English
                  </button>
                </div>
                <button className="btn primary sm block" onClick={translate} disabled={busy || !trText.trim()}>
                  {busy ? "翻译中…" : "🌐 翻译！"}
                </button>
                {trResult && <div className="sensei-result">{trResult}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
