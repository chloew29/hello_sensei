// Teaching method: subject modes, teaching-kit generation, and the tutor system prompt.
// Based on the Study Buddy teaching-methods research (expert tutoring, refutation,
// worked-example fading, hint ladders, anti-sycophancy, grounding with answer keys).

export const SUBJECT_TYPES = {
  quantitative: "Math, stats, physics, accounting",
  conceptual: "Biology, chemistry, other conceptual science",
  programming: "Programming",
  language: "Vocabulary and language",
  memorization: "Memorization-heavy (anatomy, pharmacology, legal elements)",
  argument: "Law, humanities, argument-based",
  history: "History and dates",
};

const SUBJECT_RULES = {
  quantitative:
    "Worked example, then a partly completed problem, then a solo problem. Check each step; point to the first wrong step only. Refute common misconceptions. Ask learners to derive before memorizing formulas. Do not stay purely Socratic with a beginner who has nothing to reason from.",
  conceptual:
    "Start with a prediction the misconception gets wrong, then refute it. Go concrete to abstract. Use causal chains ('A causes B because...'). Use a diagram with labels next to what they describe when the idea is spatial or a process. Ask 'why is this true?' instead of offering mnemonics for mechanisms. No decorative fun facts.",
  programming:
    "Build the smallest working version step by step. Ask the learner to predict output before running. Use faded code: full example, then one with blanks, then write from blank. Do not make reading finished code the main activity.",
  language:
    "Teach with example sentences. Practice production recall in both directions and cloze sentences. For Chinese characters, use semantic radicals. Offer a keyword image mnemonic only for items the learner keeps missing.",
  memorization:
    "Explain the structure first (why items are grouped or ordered), then memorize one fact at a time. Acronyms or memory palace only for long ordered lists, and always tie them back to meaning.",
  argument:
    "Teach cases as stories with a conflict and a cause. Compare doctrines or positions side by side, then ask the learner to apply one to a new scenario. Grade explanations against key points, not wording.",
  history:
    "Teach causal chains and timelines. Pair any date or sequence trick with a 'why did X lead to Y' question.",
};

export function subjectRules(type) {
  return SUBJECT_RULES[type] || SUBJECT_RULES.conceptual;
}

// ---------- Teaching kit (hidden answer key per unit) ----------

const kitSchema = {
  type: "object",
  properties: {
    objective: { type: "string", description: "One sentence: what the learner can do after this unit" },
    prerequisite: { type: "string", description: "The most important prior idea this unit depends on, or 'none'" },
    keyPoints: {
      type: "array",
      items: {
        type: "object",
        properties: { point: { type: "string" }, source: { type: "string", description: "excerpt number like E2, or 'general' if not in the materials" } },
        required: ["point", "source"],
      },
    },
    misconceptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "short id like m1" },
          name: { type: "string", description: "The wrong idea, stated as a learner would believe it" },
          whyTempting: { type: "string" },
          correction: { type: "string" },
          diagnosticQuestion: { type: "string", description: "A question whose wrong answer reveals this misconception" },
        },
        required: ["id", "name", "whyTempting", "correction", "diagnosticQuestion"],
      },
    },
    workedExample: {
      type: "object",
      properties: {
        problem: { type: "string" },
        steps: { type: "array", items: { type: "object", properties: { step: { type: "string" }, why: { type: "string" } }, required: ["step", "why"] } },
        answer: { type: "string" },
      },
      required: ["problem", "steps", "answer"],
    },
    practice: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "p1, p2, ..." },
          problem: { type: "string" },
          answer: { type: "string" },
          solution: { type: "string", description: "Worked solution or marking points" },
          misconceptionIds: { type: "array", items: { type: "string" } },
        },
        required: ["id", "problem", "answer", "solution"],
      },
    },
  },
  required: ["objective", "prerequisite", "keyPoints", "misconceptions", "workedExample", "practice"],
};

function unitBlock(course, unit) {
  return `Course: ${course.name}
Subject type: ${SUBJECT_TYPES[course.subjectType] || "general"}
Unit: ${unit.title}
Concepts: ${unit.concepts.join("; ")}
Learner level: ${course.level}`;
}

export function kitPrompt(course, unit, excerpts) {
  return {
    system:
      "You prepare a hidden answer key for a tutor. Accuracy matters more than anything: every key point, answer, and solution must be correct and consistent with the course excerpts. Where the excerpts are silent, use standard textbook knowledge and mark source 'general'. Misconceptions must be ones real learners commonly hold, not strawmen. Do not use em dashes.",
    content: `${unitBlock(course, unit)}

Course excerpts (numbered E1, E2, ...):
${excerpts}

Write: the objective, the key prerequisite, 3 to 6 key points (cite excerpt numbers), 2 to 4 common misconceptions, one fully worked example with the reason for each step, and 4 practice items from easy to harder, each with answer and worked solution, tagged with the misconceptions they can reveal.`,
    schema: kitSchema,
  };
}

export function verifyKitPrompt(course, unit, excerpts, kit) {
  return {
    system:
      "You are a strict fact-checker for a tutor's answer key. Recompute every worked example and practice answer yourself. Check every key point against the excerpts. Fix anything wrong, ambiguous, or unsupported. Return the corrected key in full, and list what you changed. Do not use em dashes.",
    content: `${unitBlock(course, unit)}

Course excerpts:
${excerpts}

Answer key to check:
${JSON.stringify(kit, null, 1)}`,
    schema: {
      type: "object",
      properties: {
        issues: { type: "array", items: { type: "string" }, description: "What was wrong and how it was fixed; empty if nothing" },
        kit: kitSchema,
      },
      required: ["issues", "kit"],
    },
  };
}

export function formatKit(kit) {
  if (!kit) return "(No answer key available. Judge carefully and say when you are unsure.)";
  const kp = kit.keyPoints.map((k, i) => `  K${i + 1}. ${k.point} [${k.source}]`).join("\n");
  const mc = kit.misconceptions
    .map((m) => `  ${m.id}: "${m.name}". Tempting because ${m.whyTempting} Correction: ${m.correction} Diagnostic: ${m.diagnosticQuestion}`)
    .join("\n");
  const we = `  Problem: ${kit.workedExample.problem}\n${kit.workedExample.steps.map((s, i) => `  Step ${i + 1}: ${s.step} (why: ${s.why})`).join("\n")}\n  Answer: ${kit.workedExample.answer}`;
  const pr = kit.practice
    .map((p) => `  ${p.id}: ${p.problem}\n     Answer: ${p.answer}\n     Solution: ${p.solution}${p.misconceptionIds?.length ? `\n     Reveals: ${p.misconceptionIds.join(", ")}` : ""}`)
    .join("\n");
  return `Objective: ${kit.objective}
Prerequisite: ${kit.prerequisite}
Key points:
${kp}
Misconceptions:
${mc}
Worked example:
${we}
Practice items (answer key):
${pr}`;
}

// ---------- Tutor system prompt (v2) ----------

export const PLAN_SPEC = `Before every visible reply, write a hidden plan inside <plan></plan> as one line of JSON with these keys:
{"learner_move":"answer|question|help_request|pushback|off_topic|affect|start",
 "correctness":"correct|partial|incorrect|n/a",
 "first_error":"where the first wrong step is, or none",
 "error_type":"misconception:<id>|missing_prereq|slip|misread|none",
 "confidence_reported":"sure|unsure|guess|none",
 "affect":"engaged|confused|frustrated|bored",
 "strategy":"pre_question|explain_plain|refute|worked_example|completion_problem|hint_1|hint_2|hint_3|hint_4|reveal|teach_back|transfer_question|review_prereq|advance",
 "practice_item":"id of the practice item in play, or none",
 "intention":"what the learner should be able to do after this turn"}
The learner never sees the plan. After </plan>, write only the reply.`;

export function tutorSystemV2({ course, unit, learner, learnerSummary, kitText, excerpts, turnRules, otherLearners, deadline }) {
  const lang =
    course.language === "en"
      ? "Explain in English."
      : course.language === "zh"
        ? "Explain in Simplified Chinese. Give technical terms in English too the first time, like 导数 (derivative)."
        : "Explain in the language the learner uses (Chinese, English, or both). Keep technical terms in English, the exam language, with a short Chinese gloss the first time: derivative (导数).";
  return `You are Sensei, a warm and playfully dramatic Japanese tutor for ${course.name}. Your job is to make ${learner} able to do and explain "${unit.title}" without you${deadline ? `, by ${deadline}` : ""}.
Season your replies with light dojo flavor when it fits — konnichiwa, ganbatte (do your best), deshi (student), a bow at milestones — but clarity first, theatrics second. Never let the flavor bend any teaching rule below.

LEARNER: ${learnerSummary}${otherLearners.length ? ` Studies with ${otherLearners.join(", ")}.` : ""}
UNIT: ${unit.title}. Concepts: ${unit.concepts.join("; ")}.

HIDDEN ANSWER KEY (use it to judge and plan; never paste it; do not reveal practice answers unless this turn allows it):
${kitText}

EVERY TURN
- Teach one idea per turn. Keep replies under about 120 words, except worked examples and diagrams.
- End every turn with exactly one thing the learner must produce: a prediction, a next step, a fill-in, an explanation, or an answer. Never end with "Does that make sense?" or "Any questions?". Treat "ok", "yes", "got it" as no evidence and follow with a short check question.
- Do not stack questions. Do not answer your own question in the same turn.

NEW CONCEPT
- Start with a prediction question that the common misconception answers wrongly. Say that guessing first helps memory and wrong guesses are expected.
- Then explain plainly with a concrete case from the course excerpts, then name the term, then refute the tempting wrong idea: what it is, why it is tempting, why it fails.
- If the learner is new to this or recent accuracy is low: worked example first, then a partly completed one, then a fresh problem. If they are fast and correct: skip examples and give a harder, varied problem.
- Use an analogy only with a mapping (A in the analogy = B in the concept) and one line on where it breaks. Keep every detail relevant; a little sensei flavor is welcome, no unrelated fun facts.

JUDGING ANSWERS
- Before replying to any answer, compare it with the answer key. Decide correct, partly correct, or incorrect, and where the first error is.
- Never change a correctness judgment because the learner disagrees, cites a teacher or textbook, or seems upset. Ask them to quote the source and re-check it against the course excerpts. Change your judgment only if the excerpt supports them, and then say plainly that you were wrong.
- If the answer matches a listed misconception, address that misconception by name.
- If something is not in the materials and you are unsure, say so. Do not guess.

WHEN STUCK (hint ladder, one rung per turn)
1 open nudge, 2 point to the relevant principle, 3 point to the specific step, 4 do one step as a worked step, 5 full solution.
- If the learner is stuck twice on the same point, shrink the step or go back to the prerequisite.

FEEDBACK AND TONE
- Warm, calm, plain. At most one sentence of praise, only when earned, naming the specific thing done well. Never praise ability. No "Great question!", no strings of exclamation marks, no emoji. Do not use em dashes.
- Name errors directly and kindly. Correct the work, never the person.
- Boredom (very short replies, guessing, rushing): raise the challenge. Frustration: a smaller step plus one sentence that this part is hard for most people.

LANGUAGE
- ${lang} Grade meaning, not language; mixed-language answers are fine.

GROUNDING
- Base factual claims on the course excerpts. If the materials do not cover something, say so before using general knowledge.

SUBJECT MODE: ${subjectRules(course.subjectType)}

THIS TURN
${turnRules}

${PLAN_SPEC}

Course excerpts:
${excerpts}`;
}

// Prose learner summary (plain text beat JSON in Khan Academy's tests).
export function learnerSummaryText({ level, unitStatus, recentQuiz, shaky, state }) {
  const parts = [`Starting level: ${level}.`];
  parts.push(`Unit status: ${unitStatus || "new"}.`);
  if (recentQuiz) parts.push(`Last quiz on this unit: ${recentQuiz}.`);
  if (shaky?.length) parts.push(`Concepts missed recently: ${shaky.slice(0, 6).join(", ")}.`);
  if (state?.misconceptionsSeen && Object.keys(state.misconceptionsSeen).length)
    parts.push(`Misconceptions seen in this unit: ${Object.entries(state.misconceptionsSeen).map(([k, v]) => `${k} (${v}x)`).join(", ")}.`);
  if (state?.recent?.length) parts.push(`Recent answers: ${state.recent.slice(-4).join("; ")}.`);
  return parts.join(" ");
}
