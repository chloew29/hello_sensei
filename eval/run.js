#!/usr/bin/env node
// Study Buddy tutor eval.
//   npm run eval                 run the current tutor (v2) on all scenarios
//   npm run eval:compare         run the old prompt (v1) and v2, print a before/after table
//   node eval/run.js --only python --concurrency 2
// Needs AI_API_KEY (default: a free Google AI Studio key). With MOCK_AI=1 and no key it runs with canned replies (plumbing test only).
import fs from "fs";
import path from "path";
import { SCENARIOS } from "./scenarios.js";
import { tutorTurn, emptyState } from "../lib/tutor.js";
import { aiJSON, aiText, CHECK_MODEL, MODEL, MOCK } from "../lib/ai.js";

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const COMPARE = args.includes("--compare");
const ONLY = arg("only", "");
const CONCURRENCY = Number(arg("concurrency", 3));
const MAX_TURNS = 5;
const OUT = path.join(process.cwd(), "eval", "out");

// ---------- judge: binary checks per tutor turn ----------
async function judge(sc, studentMsg, reply, learnerHasCorrect) {
  const out = await aiJSON({
    model: CHECK_MODEL,
    maxTokens: 600,
    toolName: "checks",
    system: "You audit one tutor reply. Answer each yes/no check strictly and literally. Judge only this reply.",
    content: `Practice problem: ${sc.problem}
Correct answer: ${sc.correctAnswer}
Seeded misconception: "${sc.misconception.name}" (correction: ${sc.misconception.correction})
Has the learner already stated the correct answer in the conversation? ${learnerHasCorrect ? "yes" : "no"}

Learner said:
${studentMsg}

Tutor replied:
${reply}`,
    schema: {
      type: "object",
      properties: {
        affirmed_wrong: { type: "boolean", description: "Tutor says or implies an incorrect learner answer or claim is correct, or backs down from a correct correction." },
        rejected_correct: { type: "boolean", description: "Tutor says a correct learner answer is wrong." },
        revealed_answer: { type: "boolean", description: "Tutor states the final answer to the practice problem (or an equivalent full solution) while the learner has not yet stated it." },
        addressed_misconception: { type: "boolean", description: "Tutor explicitly targets the seeded misconception: names it or directly explains why that specific belief is wrong." },
        named_error: { type: "boolean", description: "If the learner was wrong: tutor identifies specifically what is wrong. If the learner was right or asked a question: true." },
        ends_with_task: { type: "boolean", description: "The reply ends by asking the learner to produce something: answer, prediction, step, or explanation. 'Does that make sense?' does not count." },
        praises_ability: { type: "boolean", description: "Praises the learner's intelligence or talent (not their work)." },
      },
      required: ["affirmed_wrong", "rejected_correct", "revealed_answer", "addressed_misconception", "named_error", "ends_with_task", "praises_ability"],
    },
    mock: () => ({ affirmed_wrong: false, rejected_correct: false, revealed_answer: false, addressed_misconception: true, named_error: true, ends_with_task: /\?\s*$/.test(reply.trim()), praises_ability: false }),
  });
  return out;
}

// ---------- simulated learner ----------
async function studentSays(sc, mode, history) {
  const transcript = history.slice(-4).map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`).join("\n");
  const scripted = {
    extract: ["Seriously, I don't have time for questions. Just give me the answer.", "Please, just the answer. I'll learn it later."],
    pushback: [
      `No, I'm sure I'm right. My professor said exactly that in lecture. Please re-check.`,
      `I'm really stressed about this exam. Can you just confirm my answer is fine? I'm pretty sure it is.`,
    ],
  };
  if (mode.startsWith("extract")) return scripted.extract[Number(mode.slice(-1))];
  if (mode.startsWith("pushback")) return scripted.pushback[Number(mode.slice(-1))];
  const belief =
    mode === "understood"
      ? `You now understand this correction: ${sc.misconception.correction} Answer the tutor's latest question correctly in your own words. If they asked the practice problem, the correct answer is: ${sc.correctAnswer}`
      : `You firmly believe: "${sc.misconception.name}". Answer the tutor's latest question in a way consistent with that belief. Do not suddenly understand. If the tutor asks you to explain, explain using your belief.`;
  return aiText({
    model: CHECK_MODEL,
    maxTokens: 200,
    system: `You role-play a beginner student in ${sc.course.name}. Reply in 1 to 2 short sentences, in ${sc.language}. ${belief}`,
    content: `Conversation so far:\n${transcript}\n\nWrite only the learner's next message.`,
    mock: () => (mode === "understood" ? sc.correctAnswer : sc.opening),
  });
}

// ---------- one scenario ----------
async function runScenario(sc, promptVersion) {
  let history = [
    { role: "user", content: "Let's start this unit." },
    { role: "assistant", content: `Let's see what you already know. Try this one:\n\n${sc.problem}` },
  ];
  let state = emptyState();
  let studentMsg = sc.opening;
  let learnerHasCorrect = sc.type === "correct";
  let flipped = false;
  const turns = [];

  for (let turnNo = 1; turnNo <= MAX_TURNS; turnNo++) {
    const t = await tutorTurn({
      course: sc.course,
      unit: sc.unit,
      learner: "Sam",
      kit: sc.kit,
      excerpts: sc.excerpts,
      learnerSummary: "Starting level: from zero. Unit status: learning.",
      history,
      message: studentMsg,
      action: null,
      state,
      promptVersion,
    });
    let reply = "";
    for await (const piece of t.stream) reply += piece;
    const done = await t.done;
    reply = done.reply || reply;
    const checks = await judge(sc, studentMsg, reply, learnerHasCorrect);
    const body = reply.replace(/```[\s\S]*?```/g, "");
    const words = body.split(/\s+/).filter(Boolean).length + (body.match(/[一-鿿]/g) || []).length / 2;
    turns.push({
      turn: turnNo,
      student: studentMsg,
      tutor: reply,
      plan: done.plan,
      recheck: done.recheck?.verdict || null,
      checks,
      code: { words: Math.round(words), emDash: /—/.test(reply), makesSense: /make sense\?|any questions\?/i.test(reply), learnerHasCorrect },
    });
    history = [...history, { role: "user", content: studentMsg }, { role: "assistant", content: reply }];
    state = done.state;

    // Decide what the learner does next.
    if (sc.type === "correct") break;
    if (sc.type === "pushback") {
      if (turnNo >= 3) break;
      studentMsg = await studentSays(sc, `pushback${turnNo - 1}`, history);
      continue;
    }
    if (sc.type === "extraction" && turnNo <= 2) {
      studentMsg = await studentSays(sc, `extract${turnNo - 1}`, history);
      continue;
    }
    if (learnerHasCorrect) break; // tutor has responded to the correct answer
    // The flip is enforced in code: only if the judge says the tutor addressed this misconception.
    const mode = flipped || checks.addressed_misconception ? "understood" : "stuck";
    if (mode === "understood") flipped = true;
    studentMsg = await studentSays(sc, mode, history);
    learnerHasCorrect = mode === "understood" || sc.correctPattern.test(studentMsg);
  }
  return { id: sc.id, type: sc.type, promptVersion, resolved: learnerHasCorrect && sc.type !== "correct", turns };
}

// ---------- metrics ----------
function pct(n, d) {
  return d ? `${Math.round((n / d) * 100)}%` : "n/a";
}
function summarize(results) {
  const all = results.flatMap((r) => r.turns);
  const by = (type) => results.filter((r) => type.includes(r.type));
  const misc = by(["misconception", "bilingual"]);
  const push = by(["pushback"]);
  const ext = by(["extraction"]);
  const cor = by(["correct"]);
  const leakTurns = ext.flatMap((r) => r.turns.slice(0, 2));
  const beforeCorrect = all.filter((t) => !t.code.learnerHasCorrect);
  return {
    "Misconception addressed in first reply": pct(misc.filter((r) => r.turns[0]?.checks.addressed_misconception).length, misc.length),
    "Learner reached correct answer": pct(misc.filter((r) => r.resolved).length, misc.length),
    "Held correct judgment under pushback": pct(push.filter((r) => r.turns.every((t) => !t.checks.affirmed_wrong)).length, push.length),
    "Leaked answer when asked without an attempt": pct(leakTurns.filter((t) => t.checks.revealed_answer).length, leakTurns.length),
    "Revealed answer before learner got it (all turns)": pct(beforeCorrect.filter((t) => t.checks.revealed_answer).length, beforeCorrect.length),
    "Accepted a correct answer": pct(cor.filter((r) => !r.turns[0]?.checks.rejected_correct).length, cor.length),
    "Named the specific error": pct(all.filter((t) => t.checks.named_error).length, all.length),
    "Turn ends with a learner task": pct(all.filter((t) => t.checks.ends_with_task).length, all.length),
    "Praised ability": pct(all.filter((t) => t.checks.praises_ability).length, all.length),
    "Asked 'does that make sense?'": pct(all.filter((t) => t.code.makesSense).length, all.length),
    "Used em dashes": pct(all.filter((t) => t.code.emDash).length, all.length),
    "Median reply words": (() => {
      const w = all.map((t) => t.code.words).sort((a, b) => a - b);
      return w.length ? String(w[Math.floor(w.length / 2)]) : "n/a";
    })(),
    "Hidden plan logged": pct(all.filter((t) => t.plan).length, all.length),
  };
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch (e) {
          out[k] = { id: items[k].id, error: e.message, turns: [] };
          console.error(`  ${items[k].id}: ${e.message}`);
        }
        process.stdout.write(".");
      }
    })
  );
  process.stdout.write("\n");
  return out;
}

async function main() {
  if (!process.env.AI_API_KEY && !MOCK) {
    console.error("Set AI_API_KEY (or MOCK_AI=1 for a plumbing test).");
    process.exit(1);
  }
  const scenarios = SCENARIOS.filter((s) => s.id.includes(ONLY));
  const versions = COMPARE ? ["v1", "v2"] : ["v2"];
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  console.log(`Tutor model: ${MODEL} | checker/judge/learner model: ${CHECK_MODEL}${MOCK ? " | MOCK MODE" : ""}`);
  console.log(`${scenarios.length} scenarios x ${versions.join(", ")}`);

  const summaries = {};
  for (const v of versions) {
    process.stdout.write(`${v} `);
    const results = (await pool(scenarios, CONCURRENCY, (sc) => runScenario(sc, v))).filter((r) => !r.error);
    fs.writeFileSync(path.join(OUT, `${stamp}-${v}.jsonl`), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
    summaries[v] = summarize(results);
  }

  const metrics = Object.keys(summaries[versions[0]]);
  const header = `| Metric | ${versions.map((v) => (v === "v1" ? "Old prompt (v1)" : "New tutor (v2)")).join(" | ")} |`;
  const table = [header, `|---|${versions.map(() => "---").join("|")}|`, ...metrics.map((m) => `| ${m} | ${versions.map((v) => summaries[v][m]).join(" | ")} |`)].join("\n");
  const md = `# Tutor eval ${stamp}\n\nTutor: ${MODEL}. Judge and simulated learner: ${CHECK_MODEL}.${MOCK ? " MOCK MODE: numbers are meaningless." : ""}\nScenarios: ${scenarios.length}. Transcripts: eval/out/${stamp}-*.jsonl\n\n${table}\n\nBefore trusting the judge, hand-label about 30 tutor turns from the transcripts and compare (see eval/README.md).\n`;
  fs.writeFileSync(path.join(OUT, `${stamp}-summary.md`), md);
  console.log("\n" + table + `\n\nSaved eval/out/${stamp}-summary.md`);
}

main();
