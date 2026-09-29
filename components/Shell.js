"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import SenseiBot from "./SenseiBot";

const Ctx = createContext(null);
export const useMe = () => useContext(Ctx);

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json", ...(opts.headers || {}) } : opts.headers,
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("sb-signed-out"));
    throw new Error("Please sign in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function Shell({ title, back, children }) {
  const [me, setMe] = useState(undefined);

  const load = useCallback(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    load();
    const off = () => setMe(null);
    window.addEventListener("sb-signed-out", off);
    return () => window.removeEventListener("sb-signed-out", off);
  }, [load]);

  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    setMe(null);
  }

  return (
    <>
      <header className="top">
        <div className="top-inner">
          {back && (
            <Link href={back} className="back" aria-label="Back">
              ‹
            </Link>
          )}
          <h1>{title || "🥋 Sensei"}</h1>
          {me && (
            <button className="btn ghost sm" onClick={signOut} title="Switch learner">
              {me.learner}
            </button>
          )}
        </div>
      </header>
      <main className="wrap">
        {me === undefined && (
          <p className="center muted" style={{ marginTop: 60 }}>
            <span className="spinner" />
          </p>
        )}
        {me === null && <Login onDone={load} />}
        {me && <Ctx.Provider value={me}>{children}</Ctx.Provider>}
      </main>
      {me && <SenseiBot />}
    </>
  );
}

function Login({ onDone }) {
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState([]);

  useEffect(() => {
    try {
      setKnown(JSON.parse(localStorage.getItem("sb_names") || "[]"));
    } catch {}
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ name, passcode }) });
      try {
        localStorage.setItem("sb_names", JSON.stringify([...new Set([name.trim(), ...known])].slice(0, 5)));
      } catch {}
      onDone();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 400, margin: "0 auto" }}>
      <div className="hero">
        <img className="mascot" src="/sensei-chan.png" alt="Sakura-chan" />
        <h2>Konnichiwa! 🌸</h2>
        <p className="muted">I am <b>Sensei</b>, your personal tutor. Learn any course from zero, together. Ganbatte!</p>
      </div>
      <label className="field">
        <span>Your name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required />
      </label>
      {known.length > 0 && (
        <div className="chips" style={{ marginTop: -6 }}>
          {known.map((n) => (
            <button type="button" key={n} className={`chip ${n === name ? "on" : ""}`} onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span>App passcode</span>
        <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} required />
      </label>
      {err && <div className="error">{err}</div>}
      <button className="btn primary block" disabled={busy}>
        {busy ? "Entering the dojo..." : "Hajime! Start"}
      </button>
    </form>
  );
}
