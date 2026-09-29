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
  const [rewards, setRewards] = useState(null);
  const [kissing, setKissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    if (tab === "note") {
      api("/api/bot")
        .then((d) => setNotes(d.notes || []))
        .catch(() => {});
    }
    if (tab === "dress") {
      api("/api/rewards")
        .then(setRewards)
        .catch(() => {});
    }
  }, [open, tab]);

  const avatar = rewards?.outfits?.find((o) => o.id === rewards.active)?.file || "/sensei-chan.png";

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

  async function outfitAction(action, id) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const d = await api("/api/rewards", { method: "POST", body: JSON.stringify({ action, id }) });
      setRewards(d);
      if (d.kissed) setKissing(true);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <button className="sensei-fab" onClick={() => setOpen((o) => !o)} title="Sakura-chan: 笔记 · 翻译 · 换装 🌸" aria-label="Open Sakura-chan">
        <img src={avatar} alt="Sakura-chan" />
      </button>
      {open && (
        <div className="sensei-panel">
          <div className="sensei-head">
            <img src={avatar} alt="Sakura-chan" />
            <div>
              <b>Sakura-chan 🌸</b>
              <small>
                随时帮你记笔记、翻译~{rewards !== null && <span> · 🌸 {rewards.petals}</span>}
              </small>
            </div>
          </div>
          <div className="sensei-tabs">
            <button className={`chip ${tab === "note" ? "on" : ""}`} onClick={() => setTab("note")}>
              📝 记笔记
            </button>
            <button className={`chip ${tab === "translate" ? "on" : ""}`} onClick={() => setTab("translate")}>
              🌐 翻译
            </button>
            <button className={`chip ${tab === "dress" ? "on" : ""}`} onClick={() => setTab("dress")}>
              👗 换装
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
            {tab === "dress" && (
              <>
                <p className="muted small" style={{ margin: "0 0 4px" }}>
                  答对题目赚 🌸 花瓣，攒够了给老师换新衣服！{rewards !== null && <b> 你有 {rewards.petals} 🌸</b>}
                </p>
                {rewards === null && (
                  <p className="center muted">
                    <span className="spinner" />
                  </p>
                )}
                {rewards !== null && (
                  <div className="kiss-card">
                    <img src="/outfits/kiss.png" alt="亲亲" />
                    <div>
                      <b>😘 老师的亲亲</b>
                      <small className="muted" style={{ display: "block" }}>
                        集满 10 🌸 兑换一个亲亲！{rewards.kisses > 0 && ` 已被亲过 ${rewards.kisses} 次~`}
                      </small>
                    </div>
                    <button
                      className="btn primary sm"
                      onClick={() => outfitAction("kiss")}
                      disabled={busy || rewards.petals < 10}
                    >
                      10 🌸
                    </button>
                  </div>
                )}
                <div className="wardrobe">
                  {rewards?.outfits?.map((o) => {
                    const unlocked = rewards.unlocked.includes(o.id);
                    const active = rewards.active === o.id;
                    return (
                      <div key={o.id} className={`outfit-card ${active ? "active" : ""}`}>
                        <img src={o.file} alt={o.name} />
                        <b>{o.name}</b>
                        <small className="muted">{o.desc}</small>
                        {active ? (
                          <button className="btn sm block" disabled>
                            穿着中 ✓
                          </button>
                        ) : unlocked ? (
                          <button className="btn sm block" onClick={() => outfitAction("wear", o.id)} disabled={busy}>
                            穿上 💖
                          </button>
                        ) : (
                          <button
                            className="btn primary sm block"
                            onClick={() => outfitAction("unlock", o.id)}
                            disabled={busy || rewards.petals < o.cost}
                          >
                            🔓 {o.cost} 🌸
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {kissing && (
        <div className="kiss-overlay" onClick={() => setKissing(false)}>
          <div className="kiss-pop">
            <img src="/outfits/kiss.png" alt="mua~" />
            <div className="kiss-text">mua~ 💋</div>
            <div className="kiss-sub">Sakura-chan 奖励你答对题目！继续加油哦~</div>
            {["💖", "💕", "🌸", "💗", "✨", "💘"].map((h, i) => (
              <span key={i} className="kiss-heart" style={{ left: `${8 + i * 15}%`, animationDelay: `${i * 0.35}s` }}>
                {h}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
