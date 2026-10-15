/* Full real-key e2e for Study Buddy v1.
 * Drives: onboarding (with PDF) -> plan -> sensei chat (wrong+right quiz) ->
 * stamp -> next lesson -> flashcards -> add notes -> reload persistence -> Me.
 * Saves screenshots + result.json for the quality report.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8901';
const OUT = __dirname;
const shot = (n) => path.join(OUT, `shot-${n}.png`);
const results = { steps: [], errors: [], aiMessages: [], quizzes: [], plan: null, timings: {} };
const t0 = Date.now();
const mark = (k) => { results.timings[k] = Math.round((Date.now() - t0) / 1000); };
const step = (s) => { results.steps.push(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`); console.log('STEP:', s); };

async function chatState(page) {
  return page.evaluate(() => {
    const S = JSON.parse(localStorage.getItem('sb_state_v1'));
    const c = S.courses[0];
    const l = c.lessons[c.current];
    return {
      chatLen: l.chat.length,
      stamp: !!document.querySelector('.done-stamp'),
      busy: !!document.querySelector('.typing'),
      openQuiz: [...document.querySelectorAll('.quiz')].some((q) => q.querySelector('.opt:not([disabled])')),
      done: l.done,
      cur: c.current,
      total: c.lessons.length,
    };
  });
}

async function answerQuiz(page, pickWrong) {
  return page.evaluate((pickWrong) => {
    const S = JSON.parse(localStorage.getItem('sb_state_v1'));
    const c = S.courses[0];
    const l = c.lessons[c.current];
    const m = [...l.chat].reverse().find((m) => m.quiz && m.picked == null);
    if (!m) return null;
    const ans = m.quiz.answer;
    const quizzes = [...document.querySelectorAll('.quiz')];
    const q = quizzes.reverse().find((q) => q.querySelector('.opt:not([disabled])'));
    const opts = [...q.querySelectorAll('.opt')];
    const pick = pickWrong ? (ans + 1) % opts.length : ans;
    opts[pick].click();
    return { question: m.quiz.question, picked: pick, answer: ans, correct: pick === ans };
  }, pickWrong);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on('dialog', async (d) => { step('passcode prompt seen: ' + d.message()); await d.accept('testpass123'); });
  page.on('pageerror', (e) => { results.errors.push('PAGEERROR: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error') results.errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  try {
    // ---- onboarding ----
    await page.goto(BASE + '/#/onboarding', { waitUntil: 'networkidle' });
    await page.screenshot({ path: shot('01-ob-welcome') });
    step('onboarding welcome shown');
    await page.click('[data-act="ob-next"]'); // Let's begin

    await page.fill('#ob-name', 'Tester');
    await page.fill('#ob-course', 'Intro Biology');
    await page.screenshot({ path: shot('02-ob-course') });
    await page.click('[data-act="ob-next"]');

    await page.click('[data-act="ob-set"][data-k="level"][data-v="zero"]');
    await page.click('[data-act="ob-next"]');

    await page.click('[data-act="ob-set"][data-k="goal"][data-v="pass"]');
    await page.click('[data-act="ob-set"][data-k="pace"][data-v="15"]');
    await page.click('[data-act="ob-next"]');

    await page.setInputFiles('[data-file="ob"]', path.join(OUT, 'cell-membrane-notes.pdf'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot('03-ob-upload') });
    step('PDF attached');
    await page.click('[data-act="ob-next"]'); // Build my lessons
    mark('plan_start');

    await page.waitForFunction(
      () => document.body.innerHTML.includes('Your first lesson is ready'),
      null,
      { timeout: 300000 }
    );
    mark('plan_done');
    await page.screenshot({ path: shot('04-plan-ready') });
    results.plan = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('sb_state_v1')).courses[0];
      return {
        name: c.name, kanji: c.kanji,
        lessons: c.lessons.map((l) => ({ title: l.title, goal: l.goal, stamp: l.stamp })),
        cards: c.cards,
      };
    });
    step(`plan done: ${results.plan.lessons.length} lessons, ${results.plan.cards.length} cards`);

    // ---- home ----
    await page.click('a.btn.block[href="#/home"]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot('05-home') });
    step('home shown');

    // ---- sensei lesson 1 ----
    await page.click('a[href="#/sensei/next"]');
    await page.waitForFunction(() => document.querySelector('.msg.ai'), null, { timeout: 240000 });
    mark('first_ai_msg');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: shot('06-sensei-first') });
    step('first AI teaching message received');

    let wrongDone = false, nudges = 0, shotQuiz = false;
    for (let i = 0; i < 18; i++) {
      await page.waitForFunction(() => !document.querySelector('.typing'), null, { timeout: 300000 });
      await page.waitForTimeout(1500);
      const st = await chatState(page);
      if (st.stamp || st.done) { step('lesson complete, stamp earned'); break; }
      if (st.openQuiz) {
        if (!shotQuiz) { await page.screenshot({ path: shot('07-quiz') }); shotQuiz = true; }
        const r = await answerQuiz(page, !wrongDone);
        if (r) {
          results.quizzes.push(r);
          step(`answered quiz "${r.question.slice(0, 40)}..." -> ${r.correct ? 'CORRECT' : 'WRONG (intentional)'}`);
          if (!wrongDone) wrongDone = true;
        }
      } else {
        const nudge = nudges % 3 === 2 ? 'Quiz me now on what we covered.' : 'Got it, please continue.';
        nudges++;
        await page.fill('#ask', nudge);
        await page.click('.send');
        step('nudged tutor: ' + nudge);
      }
    }
    await page.screenshot({ path: shot('08-stamp') });
    results.aiMessages = await page.evaluate(() => {
      const S = JSON.parse(localStorage.getItem('sb_state_v1'));
      const l = S.courses[0].lessons[0];
      return l.chat.filter((m) => m.role === 'ai').slice(0, 6).map((m) => ({
        say: (m.say || '').slice(0, 400),
        hasQuiz: !!m.quiz, complete: !!m.complete,
      }));
    });
    mark('lesson1_done');

    // ---- next lesson ----
    const hasNext = await page.$('[data-act="next-lesson"]');
    if (hasNext) {
      await hasNext.click();
      await page.waitForFunction(() => document.querySelector('.msg.ai'), null, { timeout: 240000 });
      await page.waitForTimeout(1000);
      const st2 = await chatState(page);
      step(`next lesson started (lesson ${st2.cur + 1})`);
      await page.screenshot({ path: shot('08b-lesson2') });
    }

    // ---- flashcards ----
    await page.goto(BASE + '/#/cards', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot('09-cards') });
    await page.click('[data-act="flip"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot('10-cards-flipped') });
    const cardText = await page.evaluate(() => document.querySelector('.flash .face-b').innerText.slice(0, 120));
    await page.click('[data-act="card-good"]');
    await page.waitForTimeout(600);
    step('flashcards flip+rate ok; back text: ' + cardText.slice(0, 60));

    // ---- add notes ----
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sb_state_v1')).courses[0].lessons.length);
    await page.goto(BASE + '/#/notes', { waitUntil: 'networkidle' });
    await page.screenshot({ path: shot('11-notes') });
    await page.setInputFiles('[data-file="notes"]', path.join(OUT, 'notes2.txt'));
    await page.waitForTimeout(1000);
    await page.click('[data-act="nt-go"]');
    await page.waitForFunction(
      (b) => JSON.parse(localStorage.getItem('sb_state_v1')).courses[0].lessons.length > b,
      before, { timeout: 300000 }
    );
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sb_state_v1')).courses[0].lessons.length);
    mark('notes_done');
    step(`add-notes: lessons ${before} -> ${after}`);

    // ---- persistence ----
    await page.reload({ waitUntil: 'networkidle' });
    await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const persisted = await page.evaluate(() => {
      const S = JSON.parse(localStorage.getItem('sb_state_v1'));
      const c = S.courses[0];
      return { lessons: c.lessons.length, doneCount: c.lessons.filter((l) => l.done).length };
    });
    results.persisted = persisted;
    step(`persistence after reload: ${persisted.lessons} lessons, ${persisted.doneCount} done`);

    // ---- Me: language switch ----
    await page.goto(BASE + '/#/me', { waitUntil: 'networkidle' });
    await page.selectOption('#me-lang', '繁體中文');
    await page.waitForTimeout(500);
    const lang = await page.evaluate(() => JSON.parse(localStorage.getItem('sb_state_v1')).lang);
    await page.screenshot({ path: shot('12-me') });
    results.lang = lang;
    step('language switched to: ' + lang);

    step('E2E COMPLETE');
  } catch (e) {
    results.fatal = e.message.slice(0, 500);
    step('FATAL: ' + e.message.slice(0, 200));
    try { await page.screenshot({ path: shot('99-fatal') }); } catch {}
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 1));
    await browser.close();
  }
  console.log('RESULT_SAVED');
})();