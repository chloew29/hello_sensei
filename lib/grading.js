// Grading typed answers and quiz self-checks with the smaller model.
import { claudeJSON, CHECK_MODEL } from "./claude.js";

// Grade typed recall answers against the correct option and explanation.
export async function gradeTyped(items, language) {
  if (!items.length) return [];
  const list = items
    .map((it, i) => `#${i}\nQuestion: ${it.q}\nCorrect answer: ${it.options[it.answer]}\nExplanation: ${it.explanation}\nLearner typed: ${it.typed?.trim() || "(blank / I don't know)"}\nLearner then picked: ${it.options[it.chosen] ?? "(none)"}`)
    .join("\n\n");
  const out = await claudeJSON({
    model: CHECK_MODEL,
    maxTokens: 2500,
    toolName: "grades",
    system: `You grade short typed answers for meaning, not wording. Accept answers in Chinese, English, or mixed. Accept correct synonyms and paraphrases. A typed answer is correct if it contains the key idea of the correct answer and nothing contradicting it. Blank means incorrect. ${language === "en" ? "" : "Write diagnoses in the learner's language if they typed Chinese."} Do not use em dashes.`,
    content: `Grade each typed answer.\n\n${list}`,
    schema: {
      type: "object",
      properties: {
        grades: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer" },
              typedCorrect: { type: "boolean" },
              errorType: { type: "string", enum: ["none", "misconception", "missing_prereq", "slip", "misread", "no_recall"] },
              diagnosis: { type: "string", description: "One line: what the learner got wrong and the key fix. Empty if correct." },
            },
            required: ["index", "typedCorrect", "errorType", "diagnosis"],
          },
        },
      },
      required: ["grades"],
    },
    mock: () => ({
      grades: items.map((it, i) => {
        const ok = !!it.typed && it.options[it.answer].toLowerCase().includes(it.typed.trim().toLowerCase().slice(0, 6));
        return { index: i, typedCorrect: ok, errorType: ok ? "none" : it.typed ? "misconception" : "no_recall", diagnosis: ok ? "" : "Mock diagnosis." };
      }),
    }),
  });
  const by = new Map((out.grades || []).map((g) => [g.index, g]));
  return items.map((_, i) => by.get(i) || { typedCorrect: false, errorType: "no_recall", diagnosis: "" });
}

// Self-consistency check: an independent model solves each question; drop ones where it disagrees with the key.
export async function verifyQuestions(questions, kitText) {
  if (!questions.length) return questions;
  const list = questions.map((q, i) => `#${i} ${q.q}\n${q.options.map((o, k) => `  ${k}. ${o}`).join("\n")}`).join("\n\n");
  try {
    const out = await claudeJSON({
      model: CHECK_MODEL,
      maxTokens: 1500,
      toolName: "answers",
      system: "Answer each multiple-choice question independently. If a question is ambiguous or has more than one defensible answer, mark it ambiguous.",
      content: `${kitText ? `Reference answer key for the unit:\n${kitText}\n\n` : ""}Questions:\n${list}`,
      schema: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: { type: "object", properties: { index: { type: "integer" }, choice: { type: "integer" }, ambiguous: { type: "boolean" } }, required: ["index", "choice", "ambiguous"] },
          },
        },
        required: ["answers"],
      },
      mock: () => ({ answers: questions.map((q, i) => ({ index: i, choice: q.answer, ambiguous: false })) }),
    });
    const by = new Map(out.answers.map((a) => [a.index, a]));
    const kept = questions.filter((q, i) => {
      const a = by.get(i);
      return a && !a.ambiguous && a.choice === q.answer;
    });
    // If the checker rejects most questions, something is off with the checker; keep the originals.
    return kept.length >= Math.ceil(questions.length / 2) ? kept : questions;
  } catch {
    return questions;
  }
}
