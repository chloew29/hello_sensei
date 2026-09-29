"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./Shell";

// ---- idle acts: 空闲状态 ----
const IDLE_ACTS = [
  { type: "sleep", img: "/teacher-anime-sleep.png", text: "Zzz… 好困…", cls: "idle-sleep" },
  { type: "snack", text: "偷吃一颗糖~ 🍡", cls: "idle-squish" },
  { type: "dance", text: "来跳个舞！💃", cls: "idle-dance" },
  { type: "wave", text: "主人还在吗？👋", cls: "idle-wave" },
  { type: "study", text: "我先复习一下…📖", cls: "idle-bob" },
  { type: "peck", text: "mua~ 💋", cls: "idle-squish" },
  { type: "stretch", text: "伸个懒腰~ 🙆", cls: "idle-stretch" },
  { type: "hum", text: "啦啦啦~ ♪(´▽｀)", cls: "idle-bob" },
  { type: "look", text: "👀 四处看看~", cls: "idle-look" },
];
const pickIdle = () => IDLE_ACTS[Math.floor(Math.random() * IDLE_ACTS.length)];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const GREETS = [
  "你好呀！有什么想问的吗？🌸",
  "主人找我？我在呢~💗",
  "嘿嘿，被发现了！😳",
  "要记笔记还是翻译？交给我吧✨",
  "mua~ 今天也要加油哦💋",
];
const LISTEN_TEXTS = ["嗯嗯，我在听👂", "记下来记下来…📝", "我在认真听哦~👀"];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  const [dragging, setDragging] = useState(false);
  const [mood, setMood] = useState(null); // { kind, text, cls } — 自然互动状态
  const [petals, setPetals] = useState([]);
  const petRef = useRef(null);
  const flipRef = useRef(null);
  const pet = useRef({ x: 0, y: 0, tx: 0, ty: 0, mode: "idle", until: 0, holdUntil: 0, face: 1 });
  const moodTimer = useRef(null);
  const petalId = useRef(0);
  const dragRef = useRef(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open ]);

  // ---- 行为表达：设置一个带自动消失的互动状态 ----
  const express = (kind, text, cls, ms = 3500) => {
    clearTimeout(moodTimer.current);
    setMood({ kind, text, cls });
    if (ms > 0) moodTimer.current = setTimeout(() => setMood(null), ms);
  };
  const clearMood = () => { clearTimeout(moodTimer.current); setMood(null); };

  // ---- 樱花花瓣粒子：开心时撒花 ----
  const burstPetals = (n = 12) => {
    const s = pet.current;
    const batch = Array.from({ length: n }, () => ({
      id: ++petalId.current,
      x: s.x + 30 + Math.random() * 140,
      y: s.y + 10 + Math.random() * 80,
      dx: (Math.random() - 0.5) * 180,
      dur: 1.6 + Math.random() * 1.4,
      delay: Math.random() * 0.4,
      size: 13 + Math.random() * 13,
      emoji: pick(["🌸", "💮", "🌸", "✨", "💖"]),
    }));
    setPetals((p) => [...p.slice(-40), ...batch]);
    setTimeout(() => setPetals((p) => p.filter((pt) => !batch.some((b) => b.id === pt.id))), 3800);
  };

  // ---- wandering desktop-pet ----
  useEffect(() => {
    const s = pet.current;
    const park = () => {
      s.x = clamp(s.x || Math.max(20, window.innerWidth - 130), 0, Math.max(0, window.innerWidth - 160));
      s.y = clamp(s.y || Math.max(90, window.innerHeight - 280), 60, Math.max(60, window.innerHeight - 240));
    };
    park();
    let raf;
    let last = performance.now();
    const SPEED = 60;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!openRef.current && s.mode !== "held" && now >= s.holdUntil) {
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

  // ---- 时间触发：按时段打招呼 ----
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 6) express("greet", "还没睡呀？夜猫子~🌙", "idle-wave", 6000);
    else if (h < 12) express("greet", "早上好！元气满满的一天~☀️", "idle-dance", 6000);
    else if (h >= 22) express("greet", "夜深啦，早点休息哦🌙", "idle-bob", 6000);
    return () => clearTimeout(moodTimer.current);
  }, []);

  // ---- 聆听触发：用户在任何输入框打字 ----
  useEffect(() => {
    let t;
    const onType = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return;
      if (dragRef.current?.moved) return;
      pet.current.holdUntil = performance.now() + 4000; // 停下来认真听
      clearTimeout(t);
      setMood((m) =>
        m && (m.kind === "panic" || m.kind === "thinking" || m.kind === "greet") ? m : { kind: "listen", text: pick(LISTEN_TEXTS), cls: "idle-listen" }
      );
      t = setTimeout(() => setMood((m) => (m && m.kind === "listen" ? null : m)), 4000);
    };
    document.addEventListener("input", onType);
    return () => { document.removeEventListener("input", onType); clearTimeout(t); };
  }, []);

  // ---- 答题撒花：quiz 得花瓣时庆祝 ----
  useEffect(() => {
    const onCelebrate = () => {
      pet.current.holdUntil = performance.now() + 4000;
      express("happy", "答对啦！Sakura-chan 为你骄傲~🎉", "idle-dance", 4000);
      burstPetals(16);
    };
    window.addEventListener("sensei-celebrate", onCelebrate);
    return () => window.removeEventListener("sensei-celebrate", onCelebrate);
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

  const avatar = rewards?.outfits?.find((o) => o.id === rewards.active)?.file || "/teacher-anime.png";

  // ---- 点击触发：惊讶 + 打招呼 + 开面板 ----
  const handlePetClick = () => {
    pet.current.holdUntil = performance.now() + 4000;
    setWoke(true);
    setTimeout(() => setWoke(false), 600);
    express("greet", pick(GREETS), "idle-woke", 4000);
    burstPetals(10);
    setOpen((o) => !o);
  };

  // ---- 拖拽触发：慌张 → 放下后松口气 ----
  const onPointerDown = (e) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pet.current.x, oy: pet.current.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 10) {
      d.moved = true;
      pet.current.mode = "held";
      setDragging(true);
      setIdleAct(null);
      setWalking(false);
      express("panic", "呀——！放我下来~😱", "idle-panic", 0);
    }
    if (d.moved) {
      const s = pet.current;
      s.x = clamp(d.ox + dx, 0, Math.max(0, window.innerWidth - 160));
      s.y = clamp(d.oy + dy, 60, Math.max(60, window.innerHeight - 240));
    }
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    if (d.moved) {
      const s = pet.current;
      s.mode = "idle";
      s.until = performance.now() + 4000;
      s.holdUntil = performance.now() + 6000; // 放下后歇一会儿
      express("relieved", "呼…得救了~ 谢谢主人💗", "idle-woke", 3500);
      burstPetals(6);
    } else {
      handlePetClick();
    }
  };

  async function saveNote() {
    if (!noteText.trim() || busy) return;
    setBusy(true);
    setErr("");
    express("thinking", "让我想想…🤔", "idle-think", 0); // 思考状态
    try {
      const d = await api("/api/bot", {
        method: "POST",
        body: JSON.stringify({ action: "note", text: noteText }),
      });
      setNotes(d.notes || []);
      setNoteText("");
      express("speak", "记好啦！✨", "idle-dance", 3000); // 说话状态
      burstPetals(8);
    } catch (e) {
      setErr(e.message);
      express("sad", "呜…出错了，再试一次吧🥺", null, 3000);
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
    express("thinking", "翻译中…让我想想🤔", "idle-think", 0); // 思考状态
    try {
      const d = await api("/api/bot", {
        method: "POST",
        body: JSON.stringify({ action: "translate", text: trText, target: trTarget }),
      });
      setTrResult(d.result || "");
      express("speak", "翻好啦！快看看~✨", "idle-dance", 3000); // 说话状态
      burstPetals(8);
    } catch (e) {
      setErr(e.message);
      express("sad", "呜…出错了，再试一次吧🥺", null, 3000);
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
      if (d.kissed) {
        setKissing(true);
        burstPetals(20);
        express("happy", "mua~ 最喜欢主人了！💋", "idle-dance", 4000);
      } else if (action === "wear") {
        express("happy", "新衣服好看吗？~💖", "idle-dance", 3000);
        burstPetals(10);
      } else if (action === "unlock") {
        express("happy", "解锁成功！快穿上试试~✨", "idle-dance", 3000);
        burstPetals(10);
      }
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  const moodCls = mood?.cls || "";
  const actCls = !mood && idleAct ? idleAct.cls : "";

  return (
    <>
      <div className="petal-layer" aria-hidden>
        {petals.map((p) => (
          <span
            key={p.id}
            className="petal"
            style={{
              left: p.x, top: p.y, fontSize: p.size,
              ["--dx"]: `${p.dx}px`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          >
            {p.emoji}
          </span>
        ))}
      </div>
      <div ref={petRef} className="pet-wander">
        <div ref={flipRef} className="pet-flip">
          <button
            className={`pet-body${moodCls ? ` ${moodCls}` : actCls ? ` ${actCls}` : ""}${walking ? " walking" : ""}${woke ? " idle-woke" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            title="Sakura-chan: 点我聊天，拖我玩 🌸"
            aria-label="Sakura-chan"
          >
            <img src={mood?.kind === "panic" ? avatar : idleAct?.img || avatar} alt="Sakura-chan" />
            {idleAct?.type === "sleep" && !mood && <span className="zzz">💤</span>}
            {mood?.kind === "thinking" && <span className="mood-badge">💭</span>}
            {mood?.kind === "listen" && <span className="mood-badge">👂</span>}
            {mood?.kind === "panic" && <span className="mood-badge">❗</span>}
          </button>
          {mood && <div className="pet-bubble">{mood.text}</div>}
          {!mood && idleAct && !open && <div className="pet-bubble">{idleAct.text}</div>}
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
                    <img src="/teacher-anime.png" alt="亲亲" />
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
            <img src="/teacher-anime.png" alt="mua~" />
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
