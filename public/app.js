import { askJSON, fileToPart } from './gemini.js';

/* ---------- tiny helpers ---------- */
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rich = (s) => esc(s).replace(/\*\*([^*<]+)\*\*/g, '<b>$1</b>'); // AI text may contain **bold**
const uid = () => Math.random().toString(36).slice(2, 10);
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const firstCJK = (s) => (String(s || '').match(/[㐀-鿿]/) || [])[0];
const go = (path) => { location.hash = '#/' + path; };
function enterCls() { // hero entrance plays once per session
  try {
    if (sessionStorage.getItem('sb_entered')) return '';
    sessionStorage.setItem('sb_entered', '1');
  } catch {}
  return ' enter';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3600);
}

const I = {
  home: '<path d="M3 11l9-7 9 7v9H3z"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V6M6 11l6-6 6 6"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  q: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17.5v.01"/>',
  cards: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/>',
  fire: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13l2 2 4-4"/>'
};
const icon = (name, size = 22, stroke = 'currentColor', w = 2) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;

/* ---------- saved state (lives on this device) ---------- */
const KEY = 'sb_state_v1';
const fresh = () => ({ name: '', lang: 'English', courses: [], activeId: null, days: {} });
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch { S = fresh(); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Storage is full. Export your data in Me, then remove an old course.'); }
}
const course = () => S.courses.find((c) => c.id === S.activeId) || S.courses[0];
const nextLessonIndex = (c) => c.lessons.findIndex((l) => !l.done);
const stampsDone = (c) => c.lessons.filter((l) => l.done).length;
function curIndex(c) {
  if (!Number.isInteger(c.current) || c.current < 0 || c.current >= c.lessons.length) c.current = Math.max(0, nextLessonIndex(c));
  return c.current;
}

let lastActive = 0;
function logStudy() {
  const now = Date.now();
  const add = lastActive ? Math.min(5, (now - lastActive) / 60000) : 1;
  lastActive = now;
  const k = dayKey();
  S.days[k] = Math.round(((S.days[k] || 0) + add) * 10) / 10;
}
function streak() {
  let n = 0; const d = new Date();
  if (!S.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (S.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function weekDays() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
}
const minutesThisWeek = () => Math.round(weekDays().reduce((a, d) => a + (S.days[dayKey(d)] || 0), 0));

/* ---------- AI prompts ---------- */
const LEVELS = { zero: ['初', 'Starting from zero', "Never studied it. Explain like I'm new."], some: ['中', 'I know a little', 'Fill in the gaps, skip what I know.'], review: ['復', 'Reviewing for a test', 'Quiz me and focus on weak spots.'] };
const GOALS = { pass: 'Pass my class', exam: 'Prepare for an exam', curious: 'Just curious' };

const PLANNER = 'You design short, friendly study plans for an AI tutor app called Study Buddy. You only output valid JSON. Be accurate; never invent facts about the material.';

function planPrompt(o) {
  return `Make a study plan.
Course: ${o.course}
Learner level: ${LEVELS[o.level][1]}
Goal: ${GOALS[o.goal]}
Time per day: ${o.pace} minutes
Write titles in: ${S.lang}
${o.fileParts.length ? 'Use the attached class materials as the main sources and follow their order.' : 'No material attached; use a standard intro curriculum for this subject.'}
Return JSON exactly like:
{"course_name": string, "kanji": one CJK character for the course,
 "lessons": [{"title": string under 60 chars, "goal": one sentence, "stamp": one CJK character for this lesson}],
 "cards": [{"front": short term or question, "back": 1-2 plain sentences}]}
Rules: 8 to 12 lessons ordered from basics, each doable in ${o.pace} minutes. 10 flashcards covering the first 3 lessons.`;
}

function tutorSystem(c, li) {
  const l = c.lessons[li];
  const ROT = ['choice', 'type', 'explain'];
  const usedKinds = (l.chat || []).filter((m) => m.quiz).map((m) => m.quiz.kind || 'choice');
  const nextKind = ROT[usedKinds.length % ROT.length];
  return `You are Hana-sensei, a warm, encouraging tutor in the Study Buddy app, with a calm Japanese-teacher style and a calico kitten.
Course: ${c.name}. Learner: ${S.name || 'the learner'}, level "${LEVELS[c.level][1]}", goal "${GOALS[c.goal]}".
Current lesson ${li + 1} of ${c.lessons.length}: "${l.title}". Lesson goal: ${l.goal}
Course outline: ${c.lessons.map((x, i) => `${i + 1}. ${x.title}`).join(' | ')}

How to teach:
- One small idea per reply, under 120 words, plain words, a concrete analogy when it helps.
- Often end with a short question so the learner thinks or restates the idea.
- After 2 or 3 small steps, check understanding with a quiz. The check format ROTATES strictly — ${usedKinds.length} check(s) used so far this lesson (${usedKinds.join(', ') || 'none yet'}), so this check MUST use format "${nextKind}". No other format is allowed this time.
  * "choice": multiple-choice, 2 to 4 options, exactly one correct. Quick recognition check.
  * "type": ask a question with a short factual answer (a term, 1-3 words) that the learner must TYPE. Provide "accept": 2-4 keyword phrases (lowercase) that count as correct. Tests recall, not recognition.
  * "explain": ask the learner to explain the idea back in their own words ("Now you teach me — explain it like I'm five"). Never mark it wrong; give warm, specific feedback.
- If the learner is wrong, be kind, explain why in one or two sentences, and try a simpler angle.
- When the learner has clearly demonstrated understanding (successful checks — a typed or explained answer counts double), set lesson_complete to true and congratulate briefly.
- Stay on this course. Never invent facts; if unsure, say so.
- Reply in ${S.lang}. You may add one short Japanese word with its meaning now and then.

Always reply with JSON only:
{"say": string, "quiz": null or {"kind": "choice" | "type" | "explain", "question": string, "options": [string] (choice only), "answer": number (choice only, 0-based index), "accept": [string] (type only, lowercase keywords), "explain": string}, "lesson_complete": boolean}`;
}

function cleanCheck(q) {
  if (!q || typeof q.question !== 'string' || !q.question.trim()) return null;
  const kind = q.kind === 'type' || q.kind === 'explain' ? q.kind : 'choice';
  const base = { kind, question: String(q.question).slice(0, 300), explain: String(q.explain || '').slice(0, 300) };
  if (kind === 'choice') {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return null;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return null;
    base.options = q.options.map((o) => String(o).slice(0, 160));
    base.answer = q.answer;
  } else if (kind === 'type') {
    if (!Array.isArray(q.accept) || !q.accept.length) return null;
    base.accept = q.accept.slice(0, 6).map((a) => String(a).toLowerCase().slice(0, 60)).filter(Boolean);
    if (!base.accept.length) return null;
  }
  return base;
}
function toContents(chat) {
  return chat.slice(-30).flatMap((m) => {
    if (m.role === 'me') return [{ role: 'user', parts: [{ text: m.text }] }];
    if (m.role === 'ai') return [{ role: 'model', parts: [{ text: JSON.stringify({ say: m.say, quiz: m.quiz || null, lesson_complete: !!m.complete }) }] }];
    return [];
  });
}

function cleanLessons(arr) {
  return (Array.isArray(arr) ? arr : []).filter((l) => l && l.title).slice(0, 12).map((l) => ({
    title: String(l.title).slice(0, 80), goal: String(l.goal || ''), stamp: firstCJK(l.stamp) || '学', done: false, chat: []
  }));
}
function cleanCards(arr) {
  return (Array.isArray(arr) ? arr : []).filter((c) => c && c.front && c.back).slice(0, 30).map((c) => ({ front: String(c.front), back: String(c.back) }));
}

/* ---------- shared bits ---------- */
function nav(active) {
  const tab = (path, label, ic) => `<a href="#/${path}"${active === path ? ' aria-current="page"' : ''}>${icon(ic)}${label}</a>`;
  return `<nav class="nav" aria-label="Main">${tab('home', 'Home', 'home')}${tab('courses', 'Courses', 'book')}${tab('sensei', 'Sensei', 'chat')}${tab('me', 'Me', 'user')}</nav>`;
}
const video = (src, poster, label) =>
  `<video src="${src}" poster="${poster}" autoplay muted loop playsinline aria-label="${esc(label)}"></video>`;
function stampGrid(c) {
  const next = nextLessonIndex(c);
  return c.lessons.map((l, i) => l.done
    ? `<div class="stamp done" title="${esc(l.title)}">${esc(l.stamp)}</div>`
    : `<div class="stamp${i === next ? ' next' : ''}" title="${esc(l.title)}">${i + 1}</div>`).join('');
}

/* ---------- onboarding ---------- */
let OB = null;
function startOnboarding(step = 0) {
  OB = { step, course: '', level: null, goal: null, pace: '15', fileParts: [], fileNames: [], busy: false, made: null };
}
function obCanNext() {
  return (OB.step === 1 && OB.course.trim() && (S.name || OB.nameDraft)) || (OB.step === 2 && OB.level) || (OB.step === 3 && OB.goal) || OB.step === 4;
}
const OB_ASK = { 1: ['何を学ぶ?', 'What are we learning together?'], 2: ['今のレベルは?', 'Where are you starting from?'], 3: ['目標は?', "What's the goal, and how much time a day?"], 4: ['もう少しだけ', "Got class materials? I'll turn them into lessons."] };
const OB_FACE = { 1: ['hana_step1', 'waving hello'], 2: ['hana_step2', 'thinking'], 3: ['hana_step3', 'cheering you on'], 4: ['hana_step4', 'happy'] };

function viewOnboarding() {
  if (!OB) startOnboarding(S.courses.length ? 1 : 0);
  const o = OB;
  if (o.step === 0) {
    return `<section class="screen no-nav welcome">
      <div class="hero${enterCls()}">${video('assets/hana_hero.mp4', 'assets/hana_hero.jpg', 'Hana-sensei smiling, a calico kitten on her head')}</div>
      <div class="speech lift rise"><div class="jp">はじめまして!</div><h1>I'm Hana-sensei. Tell me what you want to learn, and I'll build lessons just for you.</h1></div>
      <div class="cta-bottom" style="display:flex;flex-direction:column;gap:10px">
        <button class="btn block" data-act="ob-next">Let's begin</button>
        <p class="muted" style="text-align:center">Takes about a minute</p>
      </div></section>`;
  }
  if (o.step === 5) {
    return `<section class="screen no-nav" style="align-items:center;justify-content:center;text-align:center">
      <div class="spinner" role="img" aria-label="Loading"></div>
      <h1 style="font-size:20px">Hana-sensei is planning your lessons…</h1>
      <p class="muted">${o.fileParts.length ? 'Reading your materials. This can take up to a minute.' : 'Just a few seconds.'}</p></section>`;
  }
  if (o.step === 6) {
    const c = course();
    return `<section class="screen no-nav" style="align-items:center;text-align:center">
      <div class="jp rise" style="margin-top:40px">準備できました! All set</div>
      <div class="done-stamp" role="img" aria-label="First stamp"><b>始</b><small style="font-size:12px;font-weight:700;margin-top:4px">START</small></div>
      <h1 style="font-size:26px">Your first lesson is ready</h1>
      <p class="muted" style="font-size:15px">${esc(c.name)} · ${c.lessons.length} lessons · ${esc(c.pace)} min a day</p>
      <div class="card row" style="text-align:left;width:100%"><img src="assets/kit_closed.png" alt="" style="width:46px"><p style="font-size:14px">Collect a stamp for every lesson. I'll be here whenever you get stuck.</p></div>
      <a class="btn block cta-bottom" href="#/home">Start learning ${icon('next', 18, 'currentColor', 2.4)}</a></section>`;
  }
  const dots = [1, 2, 3, 4].map((i) => `<i class="${i <= o.step ? 'on' : ''}"></i>`).join('');
  let body = '';
  if (o.step === 1) {
    body = `${S.name ? '' : `<div class="field"><label for="ob-name">What should I call you?</label><input id="ob-name" class="input" data-ob="nameDraft" value="${esc(o.nameDraft || '')}" autocomplete="given-name"></div>`}
      <div class="field"><label for="ob-course">Course or topic</label><input id="ob-course" class="input" data-ob="course" value="${esc(o.course)}" placeholder="e.g. Intro Biology"></div>
      <p class="muted">Or pick one:</p>
      <div class="chips">${['Intro Biology', 'Statistics', 'Japanese', 'Python', 'US History'].map((c) => `<button class="chip${o.course === c ? ' on' : ''}" data-act="ob-set" data-k="course" data-v="${c}">${c}</button>`).join('')}</div>`;
  } else if (o.step === 2) {
    body = Object.entries(LEVELS).map(([k, v]) => `<button class="choice${o.level === k ? ' on' : ''}" data-act="ob-set" data-k="level" data-v="${k}"><span class="mark">${v[0]}</span><span><b style="font-size:16px">${v[1]}</b><br><span class="muted">${v[2]}</span></span></button>`).join('');
  } else if (o.step === 3) {
    body = `<b>My goal</b>${Object.entries(GOALS).map(([k, v]) => `<button class="choice${o.goal === k ? ' on' : ''}" data-act="ob-set" data-k="goal" data-v="${k}" style="min-height:56px"><b>${v}</b></button>`).join('')}
      <b style="margin-top:6px">Time each day</b>
      <div class="chips" role="group" aria-label="Time each day">${['5', '15', '30'].map((p) => `<button class="chip${o.pace === p ? ' on' : ''}" data-act="ob-set" data-k="pace" data-v="${p}" style="flex:1;min-height:60px">${p} min</button>`).join('')}</div>`;
  } else if (o.step === 4) {
    body = `<label class="drop${o.fileNames.length ? ' has' : ''}">
        <input type="file" accept="application/pdf,image/*,text/plain" data-file="ob" class="sr" multiple>
        ${icon('up', 34, 'var(--indigo)', 2.2)}
        <b style="font-size:16px">${o.fileNames.length ? esc(o.fileNames.length === 1 ? o.fileNames[0] : o.fileNames.length + ' files selected') : 'Add slides, syllabus or notes'}</b>
        <span class="muted">${o.fileNames.length ? esc(o.fileNames.join(', ')) + ' — tap to choose different files' : 'PDF or photos of your notes, as many as you like (optional)'}</span>
      </label>
      <p class="muted" style="text-align:center">You can also add material later.</p>`;
  }
  const label = o.step === 4 ? (o.fileNames.length ? 'Build my lessons' : 'Skip and build my lessons') : 'Next';
  return `<section class="screen no-nav">
    <div class="topbar"><button class="icon-btn" aria-label="Back" data-act="ob-back">${icon('back')}</button><div class="progress" aria-label="Step ${o.step} of 4">${dots}</div><span class="muted">${o.step}/4</span></div>
    <div class="speaker"><div class="face">${video(`assets/${OB_FACE[o.step][0]}.mp4`, `assets/${OB_FACE[o.step][0]}.jpg`, 'Hana-sensei ' + OB_FACE[o.step][1])}</div>
      <div class="speech"><div class="jp">${OB_ASK[o.step][0]}</div><h1>${OB_ASK[o.step][1]}</h1></div></div>
    <div style="display:flex;flex-direction:column;gap:12px" class="rise">${body}</div>
    <button class="btn block cta-bottom" data-act="ob-next" data-next ${obCanNext() ? '' : 'disabled'}>${label}</button>
  </section>`;
}

async function buildCourse() {
  const o = OB;
  if (o.nameDraft && !S.name) S.name = o.nameDraft.trim();
  o.step = 5; render();
  try {
    const parts = [{ text: planPrompt(o) }];
    parts.push(...o.fileParts);
    const out = await askJSON({ system: PLANNER, contents: [{ role: 'user', parts }], temperature: 0.4 });
    const lessons = cleanLessons(out.lessons);
    if (!lessons.length) throw new Error('No lessons came back. Please try again.');
    const c = {
      id: uid(), name: String(out.course_name || o.course).slice(0, 60), kanji: firstCJK(out.kanji) || '学',
      level: o.level, goal: o.goal, pace: o.pace, lessons, cards: cleanCards(out.cards),
      materials: o.fileNames.map(n => ({ name: n, date: dayKey(), added: lessons.length })), created: dayKey()
    };
    S.courses.push(c); S.activeId = c.id; save();
    o.step = 6;
  } catch (e) {
    o.step = 4; toast(e.message);
  }
  render();
}

/* ---------- home ---------- */
function viewHome() {
  const c = course();
  const ni = nextLessonIndex(c);
  const l = c.lessons[ni];
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'こんばんは';
  const today = l
    ? `<section class="today rise" aria-label="Today's lesson"><div class="row" style="justify-content:space-between"><span class="jp">今日のレッスン · ${esc(c.name)}</span><span style="font-size:13px;opacity:.9">~${esc(c.pace)} min</span></div>
        <h2>${esc(l.title)}</h2><p style="font-size:14px;opacity:.9">Lesson ${ni + 1} of ${c.lessons.length}</p>
        <a class="btn light" href="#/sensei/next" style="align-self:flex-start">${l.chat.length ? 'Continue' : 'Start lesson'} ${icon('next', 18, 'currentColor', 2.4)}</a></section>`
    : `<section class="today rise"><span class="jp">おめでとう!</span><h2>You finished ${esc(c.name)}!</h2><a class="btn light" href="#/notes" style="align-self:flex-start">Add more material</a></section>`;
  const tile = (href, label, ic, bg, fg) => `<a class="tile" href="${href}"><span class="dot" style="background:${bg}">${icon(ic, 20, fg)}</span>${label}</a>`;
  return `<section class="screen">
    <div class="hero${enterCls()}">${video('assets/hana_hero.mp4', 'assets/hana_hero.jpg', 'Hana-sensei smiling, a calico kitten on her head')}<span class="pill">${'冬冬春春春夏夏夏秋秋秋冬'[new Date().getMonth()]} · ${new Date().toLocaleDateString(undefined, { weekday: 'long' })}</span></div>
    <div class="speech lift rise"><div class="jp">${hello}${S.name ? '、' + esc(S.name) : ''}!</div><h1>${streak() > 1 ? `${streak()} days in a row. Keep it going!` : 'Just one small lesson today. I saved your spot!'}</h1></div>
    ${today}
    <section class="card rise" aria-label="Stamp book"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="font-size:16px">Stamp book <span class="jp" style="font-weight:500">はんこ帳</span></h2><span class="muted">${stampsDone(c)} of ${c.lessons.length}</span></div>
      <div class="stamps" role="img" aria-label="${stampsDone(c)} of ${c.lessons.length} stamps">${stampGrid(c)}</div></section>
    ${examPrepCard(c)}
    <section aria-label="Ways to learn" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px">Learn it your way <span class="jp" style="font-weight:500">いろいろな学び方</span></h2>
      <div class="tiles">${tile('#/sensei', 'Explain', 'chat', 'var(--sakura-l)', 'var(--plum)')}${tile('#/sensei/quiz', 'Quiz me', 'q', 'var(--matcha-l)', 'var(--matcha)')}${tile('#/cards', 'Flashcards', 'cards', '#DCE3F0', 'var(--indigo)')}${tile('#/notes', 'Add notes', 'up', '#F8E6CF', '#8A5212')}</div></section>
  </section>${nav('home')}`;
}

/* ---------- sensei chat ---------- */
let busy = false;
let blocked = false; // stops auto-start from retrying in a loop after an error
function renderCheck(m, mi) {
  const q = m.quiz;
  if (!q || !q.question) return '';
  const kind = q.kind || 'choice';
  const answered = m.picked != null;
  let inner = '';
  if (kind === 'choice' && Array.isArray(q.options)) {
    inner = q.options.map((op, oi) => {
      let cls = '';
      if (answered) { if (oi === q.answer) cls = ' right'; else if (oi === m.picked) cls = ' wrong'; }
      return `<button class="opt${cls}" data-act="answer" data-m="${mi}" data-o="${oi}" ${answered || busy ? 'disabled' : ''}>${rich(op)}</button>`;
    }).join('');
  } else if (kind === 'type') {
    inner = answered
      ? `<div class="typed${m.picked === 'right' ? ' right' : ' wrong'}">${esc(m.typed || '')}</div>`
      : `<form class="type-row" data-form="check" data-m="${mi}"><input class="input" name="t" placeholder="Type your answer…" autocomplete="off" aria-label="Type your answer" ${busy ? 'disabled' : ''}><button class="btn" type="submit" ${busy ? 'disabled' : ''}>Check</button></form>`;
  } else if (kind === 'explain') {
    inner = answered
      ? `<div class="muted" style="font-size:13px">Answered — see your message below ✓</div>`
      : `<form class="type-row" data-form="check" data-m="${mi}"><input class="input" name="t" placeholder="Your explanation…" autocomplete="off" aria-label="Explain in your own words" ${busy ? 'disabled' : ''}><button class="btn" type="submit" ${busy ? 'disabled' : ''}>Send</button></form>`;
  }
  return `<div class="quiz"><div class="q">${rich(q.question)}</div>${inner}</div>`;
}

function renderMsg(m, mi) {
  if (m.role === 'me') return m.hidden ? '' : `<div class="msg me">${esc(m.text)}</div>`;
  if (m.role === 'note') return `<div class="msg ai ${m.kind}">${rich(m.text)}</div>`;
  if (m.role === 'stamp') return `<div class="done-stamp" role="img" aria-label="Lesson stamp earned"><b>${esc(m.stamp)}</b><small style="font-size:11px;font-weight:700;margin-top:4px">No.${m.n}</small></div>`;
  return `<div class="msg ai">${rich(m.say)}${renderCheck(m, mi)}</div>`;
}

function normAns(s) { return String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff ]/g, ' ').replace(/\s+/g, ' ').trim(); }

function answerTyped(mi, text) {
  const c = course();
  const l = c.lessons[curIndex(c)];
  const m = l && l.chat[mi];
  if (!m || !m.quiz || m.picked != null || busy) return;
  const t = String(text).trim();
  if (!t) return;
  const kind = m.quiz.kind || 'choice';
  if (kind === 'type') {
    const nt = normAns(t);
    const right = (m.quiz.accept || []).some((k) => { const nk = normAns(k); return nk && (nt.includes(nk) || (nk.includes(nt) && nt.length >= 4)); });
    m.picked = right ? 'right' : 'wrong';
    m.typed = t;
    l.chat.push({ role: 'note', kind: right ? 'good' : 'bad', text: (right ? '正解! ' : 'Almost! ') + (m.quiz.explain || '') });
    send(`I answered the typed question "${m.quiz.question}" with "${t}". That is ${right ? 'correct' : 'incorrect'}. Please continue.`, true);
  } else if (kind === 'explain') {
    m.picked = 'done';
    l.chat.push({ role: 'me', text: t });
    send(`The learner explained "${m.quiz.question}" in their own words: "${t}". Give brief, warm, specific feedback (1-2 sentences) — praise what's right, gently fix what's off — then continue the lesson.`, true);
  }
}

function viewSensei(arg) {
  const c = course();
  if (arg === 'next') { const n = nextLessonIndex(c); if (n >= 0) c.current = n; save(); history.replaceState(null, '', '#/sensei'); arg = ''; }
  const li = curIndex(c);
  const l = c.lessons[li];
  if (!l.chat.length && !busy && !blocked) setTimeout(() => send('Start the lesson.', true), 0);
  if (arg === 'quiz' && !busy) { history.replaceState(null, '', '#/sensei'); if (l.chat.length) setTimeout(() => send("Quiz me now on what we've covered so far.", true), 0); }
  const allDone = nextLessonIndex(c) < 0;
  const chips = !l.chat.length ? ['Start the lesson'] : ['Explain again more simply', 'Give me an example', 'Quiz me'];
  const top = l.done
    ? (allDone ? '<a class="btn block" href="#/notes">Course done! Add more material</a>' : `<button class="btn block" data-act="next-lesson">Next lesson ${icon('next', 18, 'currentColor', 2.4)}</button>`)
    : `<div class="chips">${chips.map((t) => `<button class="chip" data-act="say" data-t="${esc(t)}" ${busy ? 'disabled' : ''}>${t}</button>`).join('')}</div>`;
  return `<section class="chat-screen">
    <header class="chat-head"><a class="icon-btn" href="#/home" aria-label="Back to home">${icon('back')}</a>
      <div class="avatar">${video('assets/hana_idle.mp4', 'assets/hana_idle.jpg', 'Hana-sensei')}</div>
      <div class="grow"><b style="font-size:17px">Hana-sensei</b><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)} · Lesson ${li + 1}: ${esc(l.title)}</div></div></header>
    <div class="chat-body" id="chat"><div class="muted" style="align-self:center;background:#F1E9DA;padding:4px 12px;border-radius:99px">今日のレッスン · ${esc(l.title)}</div>
      ${l.chat.map(renderMsg).join('')}${busy ? '<div class="typing" aria-label="Hana-sensei is typing"><i></i><i></i><i></i></div>' : ''}</div>
    <div class="chat-foot">
      ${top}
      <form class="composer" data-form="ask"><label for="ask" class="sr">Ask Hana-sensei</label><input id="ask" class="input" placeholder="Ask anything…" autocomplete="off" ${busy ? 'disabled' : ''}><button class="send" aria-label="Send" ${busy ? 'disabled' : ''}>${icon('next', 20, 'currentColor', 2.2)}</button></form>
    </div></section>`;
}

async function send(text, hidden = false) {
  if (busy) return;
  const c = course();
  const li = curIndex(c);
  const l = c.lessons[li];
  l.chat.push({ role: 'me', text, hidden });
  busy = true; logStudy(); save(); render();
  try {
    const out = await askJSON({ system: tutorSystem(c, li), contents: toContents(l.chat), temperature: 0.7 });
    const quiz = cleanCheck(out.quiz);
    l.chat.push({ role: 'ai', say: String(out.say || '…'), quiz, complete: !!out.lesson_complete });
    if (out.lesson_complete && !l.done) {
      l.done = true;
      l.chat.push({ role: 'stamp', stamp: l.stamp, n: li + 1 });
      toast(`Stamp earned: ${l.stamp}`);
    }
    blocked = false;
  } catch (e) {
    l.chat.pop();
    blocked = true;
    toast(e.message);
  }
  busy = false; save(); render();
}

function answer(mi, oi) {
  const c = course();
  const l = c.lessons[curIndex(c)];
  const m = l && l.chat[mi];
  if (!m || !m.quiz || m.picked != null || busy) return;
  m.picked = oi;
  const right = oi === m.quiz.answer;
  l.chat.push({ role: 'note', kind: right ? 'good' : 'bad', text: (right ? '正解! ' : 'Almost! ') + (m.quiz.explain || '') });
  send(`I answered the quiz "${m.quiz.question}" with "${m.quiz.options[oi]}". That is ${right ? 'correct' : 'incorrect'}. Please continue.`, true);
}

/* ---------- courses ---------- */
function viewCourses() {
  return `<section class="screen">
    <div class="row" style="justify-content:space-between"><div><div class="jp">私のコース</div><h1 class="title">My courses</h1></div>
      <button class="btn" style="min-height:44px;padding:0 16px;font-size:14px;box-shadow:none" data-act="new-course">${icon('plus', 16, 'currentColor', 2.6)}New</button></div>
    ${S.courses.map((c) => {
      const ni = nextLessonIndex(c);
      return `<section class="card" style="display:flex;flex-direction:column;gap:12px${c.id === course().id ? ';border:2px solid var(--indigo)' : ''}">
        <div class="row"><div class="kanji" style="width:48px;height:48px;border-radius:14px;background:var(--matcha-l);color:#3B5628;display:flex;align-items:center;justify-content:center;font-size:24px">${esc(c.kanji)}</div>
        <div class="grow"><h2 style="font-size:18px">${esc(c.name)}</h2><p class="muted">${ni < 0 ? 'Finished!' : `Lesson ${ni + 1} of ${c.lessons.length} · ${esc(c.lessons[ni].title)}`}</p></div></div>
        <div class="stamps" style="grid-template-columns:repeat(12,minmax(0,1fr));gap:4px">${stampGrid(c)}</div>
        <div class="row"><button class="btn grow" style="min-height:44px;font-size:14px;box-shadow:none" data-act="open-course" data-id="${c.id}">${c.id === course().id ? 'Continue' : 'Switch to this'}</button>
        <button class="btn-ghost red" data-act="del-course" data-id="${c.id}" aria-label="Delete ${esc(c.name)}">Delete</button></div></section>`;
    }).join('')}
    <section style="display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between"><h2 style="font-size:16px">Materials <span class="jp" style="font-weight:500">教材</span></h2><a href="#/notes" style="font-weight:700;font-size:14px">Add notes</a></div>
      <div class="list">${S.courses.flatMap((c) => (c.materials || []).map((m) => `<div>${icon('file', 22, 'var(--ink-2)')}<div class="grow"><b>${esc(m.name)}</b><div class="muted">${esc(c.name)} · ${m.added} lessons made</div></div></div>`)).join('') || '<div class="muted">No files yet.</div>'}</div></section>
  </section>${nav('courses')}`;
}

/* ---------- me ---------- */
function viewMe() {
  const total = S.courses.reduce((a, c) => a + stampsDone(c), 0);
  const week = weekDays().map((d) => `<div><span>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span><i class="${S.days[dayKey(d)] ? 'on' : ''}">${S.days[dayKey(d)] ? '済' : ''}</i></div>`).join('');
  return `<section class="screen">
    <div class="row"><div style="width:60px;height:60px;border-radius:99px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">${esc((S.name || '?')[0].toUpperCase())}</div>
      <div class="grow"><label for="me-name" class="sr">Your name</label><input id="me-name" class="input" data-me="name" value="${esc(S.name)}" placeholder="Your name" style="font-size:20px;font-weight:700;border-color:transparent;background:transparent;padding:0 4px"></div></div>
    <div class="stats"><div><b style="color:var(--shu)">${streak()}</b><span class="muted">day streak</span></div><div><b style="color:var(--indigo)">${total}</b><span class="muted">stamps</span></div><div><b style="color:var(--matcha)">${minutesThisWeek()}</b><span class="muted">min this week</span></div></div>
    <section class="card"><h2 style="font-size:15px;margin-bottom:10px">This week <span class="jp" style="font-weight:500">今週</span></h2><div class="week">${week}</div></section>
    <div class="list">
      <div><label for="me-lang" class="grow"><b>Hana-sensei speaks</b></label><select id="me-lang" data-me="lang" class="chip">${['English', '繁體中文', '日本語'].map((x) => `<option${S.lang === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
      <button data-act="passcode" style="border:none;background:none;text-align:left"><b class="grow">Change passcode</b>${icon('chev', 16, 'var(--sand)')}</button>
      <button data-act="export" style="border:none;background:none;text-align:left"><b class="grow">Back up my data</b>${icon('chev', 16, 'var(--sand)')}</button>
      <label style="cursor:pointer"><b class="grow">Restore from backup</b><input type="file" accept="application/json" data-file="restore" class="sr">${icon('chev', 16, 'var(--sand)')}</label>
      <button data-act="reset" style="border:none;background:none;text-align:left;color:#B23A26"><b class="grow">Erase everything on this device</b></button>
    </div>
    <p class="muted" style="text-align:center">Your progress is saved on this device only.</p>
  </section>${nav('me')}`;
}

/* ---------- flashcards ---------- */
let CS = { i: 0, flipped: false };
function viewCards() {
  const c = course();
  if (!c.cards.length) {
    return `<section class="screen no-nav"><div class="topbar"><a class="icon-btn" href="#/home" aria-label="Back">${icon('back')}</a><h1>Flashcards</h1></div>
      <p class="muted">No cards yet. Add notes and Hana-sensei will make some.</p><a class="btn" href="#/notes">Add notes</a></section>`;
  }
  const i = CS.i % c.cards.length;
  const card = c.cards[i];
  return `<section class="screen no-nav">
    <div class="topbar"><a class="icon-btn" href="#/home" aria-label="Back">${icon('back')}</a><div class="grow"><h1>Flashcards</h1><p class="muted">${esc(c.name)}</p></div><b style="color:var(--indigo)">${i + 1} / ${c.cards.length}</b></div>
    <div style="height:8px;background:var(--line);border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.round(((i + 1) / c.cards.length) * 100)}%;background:var(--indigo);border-radius:99px;transition:width .3s"></div></div>
    <div class="flash-wrap" style="position:relative"><img src="assets/kit_open.png" alt="" style="position:absolute;right:4px;top:-8px;width:54px;z-index:2">
      <button class="flash${CS.flipped ? ' flipped' : ''}" data-act="flip" aria-label="${esc(CS.flipped ? card.back : card.front + '. Tap to see the answer')}">
        <div class="flash-inner"><div class="face-f"><b style="font-size:26px;line-height:1.3">${esc(card.front)}</b><span class="muted">Tap to flip</span></div>
        <div class="face-b"><span style="font-size:13px;color:#F7C9D1;font-weight:700">${esc(card.front)}</span><span style="font-size:19px;line-height:1.55">${esc(card.back)}</span></div></div></button></div>
    <div class="rate" style="opacity:${CS.flipped ? 1 : 0.35};transition:opacity .2s"><button data-act="card-again" style="color:#8A3B4A">Again</button><button data-act="card-good" style="color:var(--indigo)">Good</button><button data-act="card-good" style="background:var(--matcha);color:#fff;border:none">Easy</button></div>
  </section>`;
}

/* ---------- add notes ---------- */
let NT = { courseId: null, fileParts: [], fileNames: [], busy: false };
function viewNotes() {
  const cid = NT.courseId || course().id;
  return `<section class="screen no-nav">
    <div class="topbar"><a class="icon-btn" href="#/courses" aria-label="Back">${icon('back')}</a><div><div class="jp">教材を追加</div><h1>Add notes</h1></div></div>
    <b>For which course?</b>
    <div class="chips" style="margin-top:-8px">${S.courses.map((c) => `<button class="chip${c.id === cid ? ' on' : ''}" data-act="nt-course" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <label class="drop${NT.fileNames.length ? ' has' : ''}"><input type="file" accept="application/pdf,image/*,text/plain" data-file="notes" class="sr" multiple>
      ${icon('up', 34, 'var(--indigo)', 2.2)}<b style="font-size:16px">${NT.fileNames.length ? esc(NT.fileNames.length === 1 ? NT.fileNames[0] : NT.fileNames.length + ' files selected') : 'Upload slides, syllabus or notes'}</b><span class="muted">${NT.fileNames.length ? esc(NT.fileNames.join(', ')) : 'PDF, photos or text — pick as many as you like'}</span></label>
    <div class="row"><img src="assets/kit_open.png" alt="" style="width:46px"><div class="card grow" style="padding:10px 12px;font-size:13px;border-radius:16px 16px 16px 4px">Hana-sensei turns each file into short lessons and flashcards.</div></div>
    <button class="btn block" data-act="nt-go" ${NT.fileNames.length && !NT.busy ? '' : 'disabled'}>${NT.busy ? 'Reading your materials…' : 'Make lessons'}</button>
    ${NT.busy ? '<div class="spinner" style="align-self:center" role="img" aria-label="Working"></div>' : ''}
  </section>`;
}

async function makeFromNotes() {
  const c = S.courses.find((x) => x.id === (NT.courseId || course().id));
  NT.busy = true; render();
  try {
    const out = await askJSON({
      system: PLANNER,
      contents: [{ role: 'user', parts: [{ text: `Course: ${c.name}. Existing lessons: ${c.lessons.map((l) => l.title).join(' | ')}.
The learner added new class material (attached). Write in ${S.lang}.
Return JSON: {"lessons": [{"title": string under 60 chars, "goal": one sentence, "stamp": one CJK character}], "cards": [{"front": string, "back": 1-2 sentences}]}
Make 1 to 4 lessons covering what the existing lessons do NOT already cover (empty array if nothing new), and 6 to 10 flashcards from this material.` }, ...NT.fileParts] }],
      temperature: 0.4
    });
    const lessons = cleanLessons(out.lessons), cards = cleanCards(out.cards);
    c.lessons.push(...lessons); c.cards.push(...cards);
    c.materials = c.materials || []; c.materials.unshift(...NT.fileNames.map(n => ({ name: n, date: dayKey(), added: lessons.length })));
    save(); toast(`Added ${lessons.length} lessons and ${cards.length} cards`);
    NT = { courseId: c.id, fileParts: [], fileNames: [], busy: false };
    S.activeId = c.id; save(); go('courses'); return;
  } catch (e) { toast(e.message); }
  NT.busy = false; render();
}

/* ---------- exam prep (cram + mock exam) ---------- */
function lessonBlobs(c) {
  return c.lessons.map((l, i) => {
    const taught = (l.chat || [])
      .filter((m) => m.role === 'ai' && m.say)
      .map((m) => {
        let t = String(m.say).slice(0, 700);
        if (m.quiz && m.quiz.question) t += '\nQuiz asked: ' + String(m.quiz.question).slice(0, 200);
        return t;
      })
      .join('\n---\n')
      .slice(0, 2500);
    return `Lesson ${i + 1}: ${l.title}${l.goal ? ' — ' + l.goal : ''}\n${taught ? 'Everything taught so far:\n' + taught : '(not studied yet — cover this topic fully from standard curriculum knowledge)'}`;
  });
}
function examPrepCard(c) {
  const exams = c.exams || [];
  const best = exams.length ? exams.reduce((a, b) => (a.score / a.total >= b.score / b.total ? a : b)) : null;
  return `<section class="card rise" aria-label="Exam prep">
    <h2 style="font-size:16px">Exam coming up? <span class="jp" style="font-weight:500">試験対策</span></h2>
    <p class="muted" style="margin:6px 0 12px">Cram the whole course in one day, then prove it with a mock exam.</p>
    <div class="row" style="gap:10px">
      <a class="btn grow" style="min-height:48px;font-size:14px;box-shadow:none;justify-content:center" href="#/cram">${icon('fire', 18, 'currentColor', 2.2)} Cram mode</a>
      <a class="btn grow" style="min-height:48px;font-size:14px;box-shadow:none;justify-content:center" href="#/exam">${icon('clip', 18, 'currentColor', 2.2)} Mock exam</a>
    </div>
    ${best ? `<p class="muted" style="margin-top:10px">Best mock exam: <b>${best.score}/${best.total}</b> (${Math.round(best.score / best.total * 100)}%)</p>` : ''}
  </section>`;
}

/* ---------- cram mode ---------- */
let CR = { open: -1, reveal: -1, busy: false };
function viewCram() {
  const c = course();
  const head = `<div class="topbar"><a class="icon-btn" href="#/home" aria-label="Back">${icon('back')}</a><div class="grow"><div class="jp">一夜漬け</div><h1 class="title">Cram mode</h1></div></div>`;
  let body;
  if (CR.busy) {
    return `<section class="screen no-nav" style="align-items:center;justify-content:center;text-align:center"><div class="spinner" role="img" aria-label="Loading"></div><h1 style="font-size:20px">${esc(CR.busyMsg || `Hana-sensei is condensing ${c.lessons.length} lessons…`)}</h1><p class="muted">One day. Whole course. Let's go.</p></section>`;
  }
  if (!c.cram) {
    body = `<section class="screen">${head}
      <section class="card"><h2 style="font-size:16px">Exam tomorrow? 臨時抱佛腳</h2>
        <p class="muted" style="margin-top:6px">Hana-sensei squeezes all <b>${c.lessons.length} lessons</b> of ${esc(c.name)} into one intense day — <b>everything</b>, not just the highlights: the core idea, 10 must-remember facts per lesson, and a quick self-check.</p></section>
      <button class="btn block cta-bottom" data-act="cram-build">${icon('fire', 18, 'currentColor', 2.2)} Build my cram plan</button>
    </section>`;
  } else {
    const plan = c.cram;
    const done = plan.items.filter((i) => i.done).length;
    body = `<section class="screen">${head}
      <div class="row" style="justify-content:space-between"><span class="muted">Tap a lesson, cram it, mark it done.</span><b>${done}/${plan.items.length}</b></div>
      <div class="progress" role="img" aria-label="${done} of ${plan.items.length} crammed">${plan.items.map((i) => `<i class="${i.done ? 'on' : ''}"></i>`).join('')}</div>
      ${done === plan.items.length ? `<section class="card" style="border:2px solid var(--matcha)"><h2 style="font-size:16px">全部制覇! Cram complete!</h2><p class="muted">Whole course in one day. Now prove it:</p><a class="btn block" href="#/exam" style="margin-top:10px;justify-content:center">Take the mock exam ${icon('next', 18, 'currentColor', 2.4)}</a></section>` : ''}
      <div class="acc">${plan.items.map((it, i) => `
        <div class="acc-item${it.done ? ' done' : ''}">
          <button class="acc-head" data-act="cram-toggle" data-i="${i}">
            <span style="width:40px;height:40px;flex-shrink:0;border-radius:12px;background:${it.done ? 'var(--matcha-l)' : 'var(--indigo-l)'};color:${it.done ? '#3B5628' : 'var(--indigo)'};display:flex;align-items:center;justify-content:center;font-size:20px;font-family:'Yuji Syuku',serif">${it.done ? '✓' : esc(it.stamp || '学')}</span>
            <span class="grow" style="text-align:left"><b>${esc(it.title)}</b></span>${icon('chev', 18, 'var(--sand)')}</button>
          ${CR.open === i ? `<div class="acc-body">
            <p><b>Core idea:</b> ${rich(it.core)}</p>
            <ul>${it.points.map((p) => `<li>${rich(p)}</li>`).join('')}</ul>
            <div class="check"><b>Self-check:</b> ${rich(it.check_q)}
              ${CR.reveal === i ? `<p class="ans">${rich(it.check_a)}</p>` : `<div><button class="chip" data-act="cram-reveal" data-i="${i}">Reveal answer</button></div>`}
            </div>
            <button class="btn block" data-act="cram-done" data-i="${i}">${it.done ? 'Crammed! Tap to undo' : 'Got it — mark as crammed'}</button>
          </div>` : ''}
        </div>`).join('')}</div>
      <button class="chip" data-act="cram-again" style="align-self:center">Rebuild plan</button>
    </section>`;
  }
  return body + nav('home');
}

async function buildCram() {
  const c = course();
  CR.busy = true; CR.busyMsg = ''; CR.open = -1; CR.reveal = -1; render();
  try {
    const cardLines = (c.cards || []).slice(0, 30).map((k) => `${k.front} → ${k.back}`).join('\n');
    const blobs = lessonBlobs(c);
    const items = [];
    const perBatch = 6;
    for (let b = 0; b < blobs.length; b += perBatch) {
      const slice = blobs.slice(b, b + perBatch);
      CR.busyMsg = `Condensing lessons ${b + 1}–${b + slice.length} of ${c.lessons.length}…`;
      render();
      const out = await askJSON({
        system: 'You design exam cram plans for an AI tutor app. You only output valid JSON. Be accurate; never invent facts about the material.',
        contents: [{ role: 'user', parts: [{ text:
`Make a one-day cram plan for an exam. It must cover ALL the content below — every lesson, every concept taught. Compress, don't omit: no major topic skipped.
Course: ${c.name}
Course content (lessons ${b + 1}–${b + slice.length} of ${c.lessons.length}):
${slice.join('\n\n')}
Key facts (flashcards):
${cardLines || '(none)'}
Write in: ${S.lang}
For EACH of these ${slice.length} lessons (same order) return: core (one sentence: the single most important idea), points (10 must-remember facts covering the WHOLE lesson — every key concept, term, and mechanism), check_q (one quick self-test question), check_a (short answer).
Return JSON exactly like: {"items":[{"title":"...","core":"...","points":["...","...","...","...","...","...","...","...","...","..."],"check_q":"...","check_a":"..."}]}` }] }],
        temperature: 0.4
      });
      (Array.isArray(out.items) ? out.items : []).slice(0, slice.length).forEach((it, j) => {
        items.push({
          title: String(it.title || c.lessons[b + j].title).slice(0, 80),
          stamp: c.lessons[b + j].stamp,
          core: String(it.core || '').slice(0, 300),
          points: (Array.isArray(it.points) ? it.points : []).slice(0, 10).map((p) => String(p).slice(0, 200)),
          check_q: String(it.check_q || '').slice(0, 200),
          check_a: String(it.check_a || '').slice(0, 200),
          done: false
        });
      });
    }
    if (items.length < c.lessons.length) throw new Error('The plan came back incomplete. Please try again.');
    c.cram = { date: dayKey(), items };
    save();
  } catch (e) { toast(e.message); }
  CR.busy = false; render();
}

/* ---------- mock exams: several papers, one combined review ---------- */
let EX = { num: 3, per: 50, pasted: '', exams: [], ei: 0, qi: 0, busy: false, busyMsg: '', phase: 'setup', open: -1 };

function examHead() {
  return `<div class="topbar"><a class="icon-btn" href="#/home" aria-label="Back">${icon('back')}</a><div class="grow"><div class="jp">模擬試験</div><h1 class="title">Mock exams</h1></div></div>`;
}

function viewExam() {
  if (EX.busy) {
    return `<section class="screen no-nav" style="align-items:center;justify-content:center;text-align:center"><div class="spinner" role="img" aria-label="Loading"></div><h1 style="font-size:20px">${esc(EX.busyMsg || 'Working…')}</h1></section>`;
  }
  if (EX.phase === 'setup') return viewExamSetup(course());
  if (EX.phase === 'inter') return viewExamInter();
  if (EX.phase === 'review') return viewExamReview(course());
  return viewExamTaking();
}

function viewExamSetup(c) {
  const exams = c.exams || [];
  return `<section class="screen">${examHead()}
    <section class="card"><h2 style="font-size:16px">How it works</h2>
      <p class="muted" style="margin:6px 0 12px">Hana-sensei writes <b>${EX.num} mock exams</b> × <b>${EX.per} questions</b> from ${esc(c.name)}. Finish them all, then review everything together.</p>
      <div class="muted" style="font-weight:700;margin-bottom:6px">How many exams?</div>
      <div class="row" style="gap:8px;margin-bottom:12px">${[2, 3].map((n) => `<button class="chip${EX.num === n ? ' on' : ''}" data-act="exam-num" data-n="${n}">${n} exams</button>`).join('')}</div>
      <div class="muted" style="font-weight:700;margin-bottom:6px">Questions per exam?</div>
      <div class="row" style="gap:8px;margin-bottom:12px">${[10, 25, 50].map((n) => `<button class="chip${EX.per === n ? ' on' : ''}" data-act="exam-per" data-n="${n}">${n} Qs</button>`).join('')}</div>
      <div class="muted" style="font-weight:700;margin-bottom:6px">Extra material (optional)</div>
      <textarea data-ex="pasted" rows="3" placeholder="Paste anything the course doesn't cover yet — Hana-sensei will include it." style="width:100%;border-radius:14px;border:1.5px solid var(--line);padding:10px 12px;font:inherit;background:var(--white);margin-bottom:12px">${esc(EX.pasted)}</textarea>
      <button class="btn block" data-act="exam-start" style="justify-content:center">${icon('clip', 18, 'currentColor', 2.2)} Generate & start</button></section>
    ${exams.length ? `<section class="card"><h2 style="font-size:16px">Past scores</h2><div class="list" style="margin-top:8px">${exams.slice(-6).reverse().map((e) => `<div><b>${e.score}/${e.total}</b><span class="muted">${Math.round(e.score / e.total * 100)}% · ${e.date}</span></div>`).join('')}</div></section>` : ''}
  </section>` + nav('home');
}

function viewExamTaking() {
  const ex = EX.exams[EX.ei], q = ex.qs[EX.qi], picked = ex.picks[EX.qi];
  const lastQ = EX.qi + 1 === ex.qs.length, lastExam = EX.ei + 1 === EX.exams.length;
  return `<section class="screen">${examHead()}
    <div class="progress" role="img" aria-label="Exam ${EX.ei + 1} of ${EX.exams.length}, question ${EX.qi + 1} of ${ex.qs.length}">${ex.qs.map((_, i) => `<i class="${i < EX.qi || (i === EX.qi && picked != null) ? 'on' : ''}"></i>`).join('')}</div>
    <p class="muted">Exam ${EX.ei + 1} of ${EX.exams.length} · Question ${EX.qi + 1} of ${ex.qs.length}${q.lesson ? ' · ' + esc(q.lesson) : ''}</p>
    <section class="card"><div style="font-weight:700;font-size:17px;line-height:1.45">${rich(q.q)}</div>
      <div class="quiz" style="margin-top:12px">${q.options.map((op, oi) => {
        let cls = '';
        if (picked != null) { if (oi === q.answer) cls = ' right'; else if (oi === picked) cls = ' wrong'; }
        return `<button class="opt${cls}" data-act="exam-pick" data-o="${oi}" ${picked != null ? 'disabled' : ''}>${rich(op)}</button>`;
      }).join('')}</div>
      ${picked != null ? `<button class="btn block" style="margin-top:14px;justify-content:center" data-act="exam-next">${lastQ ? (lastExam ? 'Finish all exams' : `Finish exam ${EX.ei + 1}`) : 'Next question'} ${icon('next', 18, 'currentColor', 2.4)}</button>
      <p class="muted" style="text-align:center;margin-top:8px">No review yet — that comes after the last exam.</p>` : ''}
    </section></section>` + nav('home');
}

function viewExamInter() {
  const ex = EX.exams[EX.ei];
  const score = ex.qs.filter((q, i) => ex.picks[i] === q.answer).length;
  const pct = Math.round(score / ex.qs.length * 100);
  return `<section class="screen">${examHead()}
    <section class="card" style="text-align:center"><div class="jp">一区切り</div>
      <h2 style="font-size:16px;margin:4px 0">Exam ${EX.ei + 1} done!</h2>
      <div style="font-size:44px;font-weight:800">${score}<span style="font-size:20px;color:var(--sand)">/${ex.qs.length}</span></div>
      <p class="muted">${pct}% · ${EX.exams.length - EX.ei - 1} exam${EX.exams.length - EX.ei - 1 === 1 ? '' : 's'} to go. Review comes at the very end.</p>
      <button class="btn block" style="margin-top:12px;justify-content:center" data-act="exam-continue">Start exam ${EX.ei + 2} ${icon('next', 18, 'currentColor', 2.4)}</button>
    </section></section>` + nav('home');
}

function examStats() {
  const per = EX.exams.map((ex) => ({ score: ex.qs.filter((q, i) => ex.picks[i] === q.answer).length, total: ex.qs.length }));
  const total = per.reduce((s, e) => s + e.score, 0), totalQ = per.reduce((s, e) => s + e.total, 0);
  const byLesson = {};
  EX.exams.forEach((ex, ei) => ex.qs.forEach((q, qi) => {
    const k = q.lesson || 'General';
    byLesson[k] = byLesson[k] || { ok: 0, total: 0, missed: [] };
    byLesson[k].total++;
    if (ex.picks[qi] === q.answer) byLesson[k].ok++;
    else byLesson[k].missed.push({ q, picked: ex.picks[qi], exam: ei + 1 });
  }));
  const focus = Object.entries(byLesson).map(([lesson, s]) => ({ lesson, ok: s.ok, total: s.total, pct: Math.round(s.ok / s.total * 100), missed: s.missed })).sort((a, b) => a.pct - b.pct);
  return { per, total, totalQ, pct: Math.round(total / totalQ * 100), focus };
}

function viewExamReview(c) {
  const st = examStats();
  const msg = st.pct >= 90 ? '満点級! Exam-ready!' : st.pct >= 70 ? "Solid! Polish the focus areas below." : st.pct >= 50 ? 'Getting there — the focus areas are your study list.' : 'Rough! Work through the focus areas, then retake.';
  return `<section class="screen">${examHead()}
    <section class="card" style="text-align:center"><div class="jp">結果</div>
      <div style="font-size:52px;font-weight:800;line-height:1.1">${st.total}<span style="font-size:22px;color:var(--sand)">/${st.totalQ}</span></div>
      <p style="margin:6px 0"><b>${st.pct}%</b> across ${EX.exams.length} exams · ${msg}</p>
      <div class="row" style="gap:8px;justify-content:center;margin-top:8px">${st.per.map((e, i) => `<span class="chip" style="cursor:default">Exam ${i + 1}: ${e.score}/${e.total}</span>`).join('')}</div>
      <div class="row" style="gap:10px;margin-top:12px"><button class="btn grow" data-act="exam-retake" style="justify-content:center;box-shadow:none">Retake</button><a class="btn grow" href="#/home" style="justify-content:center;box-shadow:none">Home</a></div>
    </section>
    <h2 style="font-size:16px">Focus areas <span class="jp" style="font-weight:500">重点</span></h2>
    <div class="acc">${st.focus.map((f, i) => `
      <div class="acc-item"><button class="acc-head" data-act="exam-toggle" data-i="${i}">
        <span style="min-width:52px;text-align:center;font-weight:800;color:${f.pct < 70 ? 'var(--shu)' : '#3B5628'}">${f.pct}%</span>
        <span class="grow" style="text-align:left"><b>${esc(f.lesson)}</b><br><span class="muted">${f.ok}/${f.total} correct${f.missed.length ? ` · ${f.missed.length} to review` : ''}</span></span>${icon('chev', 18, 'var(--sand)')}</button>
        ${EX.open === i ? `<div class="acc-body">${f.missed.length ? f.missed.map((m) => `
          <div class="check"><div style="font-weight:700">${rich(m.q.q)}</div>
          <p>Your answer (exam ${m.exam}): <b>${esc(m.q.options[m.picked])}</b></p>
          <p>Correct: <b>${esc(m.q.options[m.q.answer])}</b></p>
          <p><b>Why:</b> ${rich(m.q.why)}</p></div>`).join('') : '<p class="muted">Nothing missed here. 完璧!</p>'}</div>` : ''}
      </div>`).join('')}</div>
  </section>` + nav('home');
}

async function startExams() {
  const c = course();
  EX.busy = true; EX.exams = []; EX.ei = 0; EX.qi = 0; EX.phase = 'exam'; EX.open = -1; render();
  try {
    const cardLines = (c.cards || []).slice(0, 30).map((k) => `${k.front} → ${k.back}`).join('\n');
    const blobs = lessonBlobs(c);
    const pasted = EX.pasted.trim();
    let priorQs = [];
    for (let e = 0; e < EX.num; e++) {
      const made = [];
      const batches = Math.ceil(EX.per / 25);
      for (let b = 0; b < batches; b++) {
        const need = Math.min(25, EX.per - made.length);
        EX.busyMsg = `Writing exam ${e + 1} of ${EX.num}${batches > 1 ? ` (part ${b + 1}/${batches})` : ''}…`;
        render();
        const out = await askJSON({
          system: 'You write mock exams for an AI tutor app. You only output valid JSON. Be accurate; never invent facts about the material.',
          contents: [{ role: 'user', parts: [{ text:
`Write mock exam ${e + 1} of ${EX.num}${batches > 1 ? `, part ${b + 1} of ${batches}` : ''}.
Course: ${c.name}
Full course content:
${blobs.join('\n\n')}
Key facts:
${cardLines || '(none)'}
${pasted ? `Extra material from the learner (include it):\n${pasted.slice(0, 4000)}\n` : ''}Write in: ${S.lang}
Generate ${need} multiple-choice questions, spread across ALL ${c.lessons.length} lessons and covering the full content above (not just highlights). Each question: q, options (array of 4 plausible options), answer (0-based index of the correct option), why (one-line explanation), lesson (the lesson title it tests).
${priorQs.length ? `Do NOT reuse these already-used questions:\n${priorQs.join('\n')}\n` : ''}Return JSON exactly like: {"questions":[{"q":"...","options":["...","...","...","..."],"answer":0,"why":"...","lesson":"..."}]}` }] }],
          temperature: 0.6
        });
        const qs = (Array.isArray(out.questions) ? out.questions : [])
          .filter((q) => q && q.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
          .slice(0, need)
          .map((q) => ({ q: String(q.q).slice(0, 300), options: q.options.map((o) => String(o).slice(0, 160)), answer: q.answer, why: String(q.why || '').slice(0, 250), lesson: String(q.lesson || '').slice(0, 60) }));
        if (!qs.length) throw new Error(`Exam ${e + 1} came back empty. Please try again.`);
        made.push(...qs);
        priorQs.push(...qs.map((q) => q.q));
      }
      if (made.length < 5) throw new Error(`Exam ${e + 1} came back short. Please try again.`);
      EX.exams.push({ qs: made, picks: [] });
    }
  } catch (e) { toast(e.message); EX.phase = 'setup'; }
  EX.busy = false; render();
}

/* ---------- router ---------- */
const routes = { onboarding: viewOnboarding, home: viewHome, sensei: viewSensei, courses: viewCourses, me: viewMe, cards: viewCards, notes: viewNotes, cram: viewCram, exam: viewExam };
function render() {
  let [r, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (!S.courses.length && r !== 'onboarding') { location.replace('#/onboarding'); return; }
  if (!routes[r]) { location.replace(S.courses.length ? '#/home' : '#/onboarding'); return; }
  if (r === 'onboarding' && OB && OB.step === 6 && !S.courses.length) OB = null;
  const focusId = document.activeElement && document.activeElement.id;
  document.body.dataset.route = r;
  app.innerHTML = routes[r](arg);
  const chat = document.getElementById('chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
  if (focusId === 'ask') { const a = document.getElementById('ask'); if (a && !a.disabled) a.focus(); }
}
let lastRoute = '';
window.addEventListener('hashchange', () => {
  const r = location.hash.split('/')[1];
  if (r !== lastRoute) { window.scrollTo(0, 0); lastRoute = r; }
  if (r === 'cards') CS = { i: CS.i, flipped: false };
  render();
});

/* ---------- events ---------- */
const actions = {
  'ob-next': () => { if (!obCanNext() && OB.step !== 0) return; if (OB.step === 4) buildCourse(); else { OB.step++; render(); } },
  'ob-back': () => { if (OB.step === 1 && S.courses.length) { OB = null; go('courses'); return; } OB.step = Math.max(0, OB.step - 1); render(); },
  'ob-set': (el) => { OB[el.dataset.k] = el.dataset.v; render(); },
  'say': (el) => { blocked = false; send(el.dataset.t === 'Start the lesson' ? 'Start the lesson.' : el.dataset.t, el.dataset.t === 'Start the lesson'); },
  'next-lesson': () => { const c = course(); c.current = nextLessonIndex(c); blocked = false; save(); render(); },
  'answer': (el) => answer(Number(el.dataset.m), Number(el.dataset.o)),
  'new-course': () => { startOnboarding(1); go('onboarding'); },
  'open-course': (el) => { S.activeId = el.dataset.id; save(); go('home'); },
  'del-course': (el) => {
    const c = S.courses.find((x) => x.id === el.dataset.id);
    if (!c || !confirm(`Delete "${c.name}" and all its progress?`)) return;
    S.courses = S.courses.filter((x) => x !== c);
    S.activeId = S.courses[0] ? S.courses[0].id : null; save(); render();
  },
  'flip': () => { CS.flipped = !CS.flipped; render(); },
  'card-good': () => { CS = { i: CS.i + 1, flipped: false }; if (CS.i % course().cards.length === 0) toast('Deck done! お疲れさま'); logStudy(); save(); render(); },
  'card-again': () => { const c = course(); const i = CS.i % c.cards.length; c.cards.push(c.cards.splice(i, 1)[0]); CS.flipped = false; save(); render(); },
  'nt-course': (el) => { NT.courseId = el.dataset.id; render(); },
  'nt-go': () => makeFromNotes(),
  'cram-build': () => buildCram(),
  'cram-again': () => buildCram(),
  'cram-toggle': (el) => { const i = Number(el.dataset.i); CR.open = CR.open === i ? -1 : i; CR.reveal = -1; render(); },
  'cram-reveal': (el) => { CR.reveal = Number(el.dataset.i); render(); },
  'cram-done': (el) => { const c = course(); const it = c.cram.items[Number(el.dataset.i)]; it.done = !it.done; save(); logStudy(); render(); },
  'exam-num': (el) => { EX.num = Number(el.dataset.n); render(); },
  'exam-per': (el) => { EX.per = Number(el.dataset.n); render(); },
  'exam-start': () => startExams(),
  'exam-pick': (el) => { const ex = EX.exams[EX.ei]; if (ex.picks[EX.qi] == null) { ex.picks[EX.qi] = Number(el.dataset.o); render(); } },
  'exam-next': () => {
    const ex = EX.exams[EX.ei];
    const lastQ = EX.qi + 1 >= ex.qs.length, lastExam = EX.ei + 1 >= EX.exams.length;
    if (lastQ && lastExam) {
      const c = course();
      c.exams = c.exams || [];
      EX.exams.forEach((x) => {
        const score = x.qs.filter((q, i) => x.picks[i] === q.answer).length;
        c.exams.push({ date: dayKey(), score, total: x.qs.length });
      });
      c.exams = c.exams.slice(-12);
      save(); logStudy();
      EX.phase = 'review';
    } else if (lastQ) { EX.phase = 'inter'; }
    else EX.qi++;
    render();
  },
  'exam-continue': () => { EX.ei++; EX.qi = 0; EX.phase = 'exam'; render(); },
  'exam-toggle': (el) => { const i = Number(el.dataset.i); EX.open = EX.open === i ? -1 : i; render(); },
  'exam-retake': () => { const { num, per, pasted } = EX; EX = { num, per, pasted, exams: [], ei: 0, qi: 0, busy: false, busyMsg: '', phase: 'setup', open: -1 }; render(); },
  'passcode': () => { const p = prompt('New passcode (must match the one set in Cloudflare)'); if (p !== null) { localStorage.setItem('sb_pass', p.trim()); toast('Passcode saved'); } },
  'export': () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `study-buddy-backup-${dayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  'reset': () => { if (confirm('Erase all courses and progress on this device?')) { S = fresh(); save(); OB = null; go('onboarding'); } }
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  e.preventDefault();
  actions[el.dataset.act]?.(el, e);
});

app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.ob) {
    OB[el.dataset.ob] = el.value;
    const btn = app.querySelector('[data-next]');
    if (btn) btn.disabled = !obCanNext();
    app.querySelectorAll('.chip[data-k="course"]').forEach((c) => c.classList.toggle('on', c.dataset.v === OB.course));
  }
  if (el.dataset.ex === 'pasted') { EX.pasted = el.value; return; }
  if (el.dataset.me === 'name') { S.name = el.value.trim(); save(); }
});

app.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.me === 'lang') { S.lang = el.value; save(); toast('Hana-sensei will use ' + el.value); return; }
  const files = el.files ? [...el.files] : [];
  if (!files.length) return;
  if (el.dataset.file === 'restore') {
    try { const data = JSON.parse(await files[0].text()); if (!Array.isArray(data.courses)) throw 0; S = Object.assign(fresh(), data); save(); toast('Backup restored'); go('home'); }
    catch { toast('That file is not a Study Buddy backup'); }
    return;
  }
  const tooBig = files.find(f => f.size > 14 * 1024 * 1024);
  if (tooBig) { toast('"' + tooBig.name + '" is over 14 MB. Keep each file under 14 MB.'); el.value = ''; return; }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > 14 * 1024 * 1024) { toast('Those files are ' + Math.round(total / 1048576) + ' MB combined. Keep the total under 14 MB.'); el.value = ''; return; }
  try {
    const parts = await Promise.all(files.map(fileToPart));
    const names = files.map(f => f.name);
    if (el.dataset.file === 'ob') { OB.fileParts = parts; OB.fileNames = names; }
    if (el.dataset.file === 'notes') { NT.fileParts = parts; NT.fileNames = names; }
    render();
  } catch (err) { toast(err.message); }
});

app.addEventListener('submit', (e) => {
  if (e.target.dataset.form === 'ask') {
    e.preventDefault();
    const input = document.getElementById('ask');
    const t = input.value.trim();
    if (t) send(t);
  } else if (e.target.dataset.form === 'check') {
    e.preventDefault();
    const input = e.target.querySelector('input[name="t"]');
    if (input && input.value.trim()) answerTyped(Number(e.target.dataset.m), input.value);
  }
});

render();
