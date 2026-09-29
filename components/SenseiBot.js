"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./Shell";

const IDLE_ACTS = [
  { type: "sleep", img: "/outfits/sleep2.png", text: "Zzz… 好困…", cls: "idle-sleep" },
  { type: "snack", text: "偷吃一颗糖~ 🍡", cls: "idle-squish" },
  { type: "dance", text: "来跳个舞！💃", cls: "idle-dance" },
  { type: "wave", text: "主人还在吗？👋", cls: "idle-wave" },
  { type: "study", text: "我先复习一下…📖", cls: "idle-bob" },
  { type: "peck", img: "/outfits/kiss2.png", text: "mua~ 💋", cls: "idle-squish" },
  { type: "stretch", text: "伸个懒腰~ 🙆", cls: "idle-stretch" },
];
const pickIdle = () => IDLE_ACTS[Math.floor(Math.random() * IDLE_ACTS.length)];

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
  const [idleAct, setIdleAct] = useState(null);
  const [woke, setWoke] = useState(false);
  const [walking, setWalking] = useState(false);
  const petRef = useRef(null);
  const flipRef = useRef(null);
  const pet = useRef({ x: 0, y: 0, tx: 0, ty: 0, mode: "idle", until: 0, face: 1 });
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open ]);

  // wandering desktop-pet: Sakura-chan strolls around on her own, pauses to act cute
  useEffect(() => {
    const s = pet.current;
    const park = () => {
      s.x = Math.max(20, window.innerWidth - 130);
      s.y = Math.max(90, window.innerHeight - 280);
    };
    park();
    let raf;
    let last = performance.now();
    const SPEED = 60;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!openRef.current) {
        if (s.mode === "walk") {
          const dx = s.tx - s.x, dy = s.ty - s.y;
          const d = Math.hypot(dx, dy);
          if (d < 5) {
            s.mode = "idle";
            s.until = now + 5000 + Math.random() * 8000;
            setIdleAct(pickIdle());
            setWalking(false);
          } else {
            s.x += (dx / d) * SPEED * dt;
            s.y += (dy / d) * SPEED * dt;
            const f = dx >= 0 ? 1 : -1;
            if (f !== s.face) {
              s.face = f;
              if (flipRef.current) flipRef.current.style.transform = `scaleX(${f})`;
            }
          }
        } else if (now >= s.until) {
          s.tx = 20 + Math.random() * Math.max(40, window.innerWidth - 150);
          s.ty = 90 + Math.random() * Math.max(40, window.innerHeight - 300);
          s.mode = "walk";
          setIdleAct(null);
          setWalking(true);
        }
      }
      if (petRef.current) petRef.current.style.transform = `translate(${s.x}px, ${s.y}px)`;
      raf = requestAnimationFrame(loop);
    };
    s.until = performance.now() + 2500;
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", park);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", park);
    };
  }, []);

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

  const avatar = rewards?.outfits?.find((o) => o.id === rewards.active)?.file || "/sensei2.png";

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
      <div ref={petRef} className="pet-wander">
        <div ref={flipRef} className="pet-flip">
          <button
            className={`pet-body${idleAct ? ` ${idleAct.cls}` : ""}${walking ? " walking" : ""}${woke ? " idle-woke" : ""}`}
            onClick={() => { setOpen((o) => !o); setWoke(true); setTimeout(() => setWoke(false), 600); }}
            title="Sakura-chan: 笔记 · 翻译 · 换装 🌸"
            aria-label="Open Sakura-chan"
          >
            <img src={idleAct?.img || avatar} alt="Sakura-chan" />
            {idleAct?.type === "sleep" && <span className="zzz">💤</span>}
          </button>
          {idleAct && !open && <div className="pet-bubble">{idleAct.text}</div>}
        </div>
      </div>
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
                    <img src="/outfits/kiss2.png" alt="亲亲" />
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
            <img src="/outfits/kiss2.png" alt="mua~" />
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
