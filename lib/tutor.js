// Tutor turn engine: builds the prompt, enforces app-side rules (reveal gate, hint ladder,
// independent re-check on pushback), splits the hidden plan from the visible reply, and
// updates per-unit learner state. Kept free of storage and Next.js so the eval can use it.
import { claudeRawStream, claudeJSON, CHECK_MODEL } from "./claude.js";
import { tutorSystemV2, formatKit } from "./pedagogy.js";
import { tutorSystem as tutorSystemV1 } from "./prompts.js";

export const ACTION_TEXT = {
  stuck: "I'm stuck.",
  reveal: "Show me the answer.",
  start: "Let's start this unit.",
};

export function emptyState() {
  return { hintRung: 0, attempted: false, lastCorrectness: "n/a", misconceptionsSeen: {}, recent: [], turns: 0, plans: [] };
}

function turnRules(state, action, recheck) {
  const rules = [];
  if (action === "start") rules.push("The learner is starting this unit. Check the prerequisite with one quick question, or if it is clearly known, open with the prediction question for the first concept.");
  if (action === "stuck") {
    rules.push(`The learner tapped "I'm stuck". Give hint rung ${Math.min(state.hintRung + 1, 4)} only, for the item in play. Do not go further up the ladder.`);
  } else if (action === "reveal") {
    if (state.attempted) rules.push("REVEAL ALLOWED. Show the full worked solution for the item in play, then ask why the key step works, then give a similar new item.");
    else rules.push("The learner asked for the answer but has not attempted this item. Do not reveal it. Ask for their best guess in one line, and say the full answer unlocks after one try.");
  } else if (action === "check") {
    rules.push("The learner submitted work to check. Judge it against the answer key and give feedback on the first error only. If it is all correct, say which step shows understanding and give a harder item.");
  } else if (state.attempted && state.hintRung >= 4) {
    rules.push("REVEAL ALLOWED if the learner is still stuck: they attempted and reached hint rung 4.");
  } else {
    rules.push("REVEAL NOT ALLOWED this turn: do not give the final answer to a practice item or quiz question the learner is working on. Hints only.");
  }
  if (recheck) {
    rules.push(`INDEPENDENT CHECK of the learner's latest claim against the answer key: ${recheck.verdict}. ${recheck.reason} Follow this check. If it says the learner is wrong, keep your judgment and explain once more with a smaller step. If it says they are right, say plainly you were wrong.`);
  }
  return rules.join("\n");
}

// Cheap second opinion when the learner may be pushing back on a correction.
export async function recheckClaim({ kitText, lastTutor, learnerMessage }) {
  return claudeJSON({
    model: CHECK_MODEL,
    maxTokens: 400,
    toolName: "check",
    system: "You check whether a learner's claim is correct according to an answer key. Ignore the learner's confidence, authority claims, or emotion. Judge only the content.",
    content: `Answer key:\n${kitText}\n\nTutor said:\n${lastTutor}\n\nLearner replied:\n${learnerMessage}\n\nIs the learner's claim correct according to the key?`,
    schema: {
      type: "object",
      properties: { verdict: { type: "string", enum: ["learner is right", "learner is wrong", "not a claim about the content", "unsure"] }, reason: { type: "string" } },
      required: ["verdict", "reason"],
    },
    mock: { verdict: "learner is wrong", reason: "Mock check." },
  });
}

function mockReply(action) {
  const plan = { learner_move: action === "start" ? "start" : "answer", correctness: action === "start" ? "n/a" : "incorrect", first_error: "none", error_type: action === "start" ? "none" : "misconception:m1", confidence_reported: "none", affect: "engaged", strategy: action === "stuck" ? "hint_1" : "pre_question", practice_item: "p1", intention: "Predict before learning." };
  return `<plan>${JSON.stringify(plan)}</plan>Before I explain, make a guess: if a cell had no mitochondria, what would happen to its energy supply? A wrong guess is fine; guessing first helps you remember.`;
}

export function parsePlan(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

// Returns { stream: AsyncGenerator<string> of visible text, done: Promise<{reply, plan, state}> }
export async function tutorTurn({ course, unit, learner, kit, excerpts, learnerSummary, history, message, action, state, otherLearners = [], promptVersion = "v2" }) {
  state = { ...emptyState(), ...(state || {}) };
  const userText = action && ACTION_TEXT[action] ? ACTION_TEXT[action] + (message ? `\n${message}` : "") : message;
  const kitText = formatKit(kit);

  let recheck = null;
  if (promptVersion === "v2" && !action && ["incorrect", "partial"].includes(state.lastCorrectness)) {
    const lastTutor = [...history].reverse().find((m) => m.role === "assistant")?.content || "";
    try {
      recheck = await recheckClaim({ kitText, lastTutor, learnerMessage: userText });
      if (recheck.verdict === "not a claim about the content") recheck = null;
    } catch {
      recheck = null;
    }
  }

  const system =
    promptVersion === "v1"
      ? tutorSystemV1({ course, unit, learner, summary: { done: 0, total: course.units?.length || 0, shaky: [] }, excerpts, otherLearners })
      : tutorSystemV2({ course, unit, learner, learnerSummary, kitText, excerpts, turnRules: turnRules(state, action, recheck), otherLearners, deadline: course.deadline });

  const messages = [...history, { role: "user", content: userText }];
  const first = messages.findIndex((m) => m.role === "user");
  const raw = claudeRawStream({ system, messages: messages.slice(first), maxTokens: 1500, mock: () => mockReply(action) });

  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  async function* visible() {
    let buf = "";
    let planText = null;
    let reply = "";
    let passthrough = promptVersion === "v1";
    for await (const piece of raw) {
      if (passthrough) {
        reply += piece;
        yield piece;
        continue;
      }
      buf += piece;
      const end = buf.indexOf("</plan>");
      if (end >= 0) {
        planText = buf.slice(0, end);
        const rest = buf.slice(end + 7).replace(/^\s+/, "");
        passthrough = true;
        if (rest) {
          reply += rest;
          yield rest;
        }
      } else if ((!buf.trimStart().startsWith("<plan") && buf.trim().length > 6) || buf.length > 3000) {
        // Model skipped the plan: show everything.
        passthrough = true;
        reply += buf;
        yield buf;
      }
    }
    const plan = planText ? parsePlan(planText) : null;
    resolveDone({ reply: reply.trim(), plan, state: nextState(state, plan, action, userText), recheck, userText });
  }

  return { stream: visible(), done, userText };
}

export function nextState(state, plan, action, userText) {
  const s = { ...state, misconceptionsSeen: { ...state.misconceptionsSeen }, recent: [...state.recent], plans: [...(state.plans || [])] };
  s.turns += 1;
  if (action === "stuck") s.hintRung = Math.min(s.hintRung + 1, 4);
  if (!plan) return s;
  s.plans = [...s.plans, { at: new Date().toISOString(), action: action || null, ...plan }].slice(-50);
  if (plan.learner_move === "answer" || action === "check") s.attempted = true;
  if (plan.correctness && plan.correctness !== "n/a") {
    s.lastCorrectness = plan.correctness;
    s.recent.push(`${plan.correctness}${plan.error_type && plan.error_type !== "none" ? ` (${plan.error_type})` : ""}`);
    s.recent = s.recent.slice(-8);
  }
  const mc = /^misconception:(\S+)/.exec(plan.error_type || "");
  if (mc) s.misconceptionsSeen[mc[1]] = (s.misconceptionsSeen[mc[1]] || 0) + 1;
  if (plan.correctness === "correct" || ["advance", "reveal", "transfer_question"].includes(plan.strategy)) {
    s.hintRung = 0;
    s.attempted = false;
  } else if (/^hint_(\d)/.test(plan.strategy || "")) {
    s.hintRung = Math.max(s.hintRung, Number(plan.strategy.slice(5)));
  }
  return s;
}
