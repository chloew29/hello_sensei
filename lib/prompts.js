export const GOALS = {
  exam: "Pass an exam",
  understand: "Real understanding",
  apply: "Apply it to a project or job",
};
export const LEVELS = { none: "Starting from zero", unsure: "Not sure of their level; rely on the diagnostic and quiz results", some: "Knows some basics", rusty: "Learned it before, rusty" };
export const LANGS = { en: "English", zh: "Chinese (中文)", both: "Both: explain in Chinese, keep terms in English" };

function goalGuidance(goal) {
  if (goal === "exam") return "Goal is passing the exam: weight toward what the syllabus and past exams test, use exam-style questions, and add timed review near the deadline.";
  if (goal === "apply") return "Goal is applying it: pair each concept with a concrete use case or small task.";
  return "Goal is real understanding: fewer topics per session, more why questions, connect concepts.";
}

function langGuidance(lang) {
  if (lang === "zh") return "Explain in Simplified Chinese. Give key terms in English too the first time, e.g. 线粒体 (mitochondria).";
  if (lang === "both") return "Explain in Simplified Chinese, but keep technical terms in English with the Chinese in parentheses the first time, e.g. mitochondria (线粒体). Quiz questions in English, the exam language.";
  return "Explain in English.";
}

export function planPrompt(course, materialText) {
  const system = `You design study plans for learners starting a course. Order units by prerequisites, from zero. Include short prerequisite units at the start if the learner level needs them (for example basic chemistry before cell biology). ${goalGuidance(course.goal)}`;
  const content = `Today: ${new Date().toISOString().slice(0, 10)}
Course: ${course.name}
Goal: ${GOALS[course.goal]}
Deadline: ${course.deadline || "none given"}
Starting level: ${LEVELS[course.level]}
Time available: ${course.minutesPerDay} minutes per day
${course.notes ? `Notes from the learner: ${course.notes}\n` : ""}
Course materials (may be partial):
<materials>
${materialText || "(none uploaded; design from standard coverage of this subject)"}
</materials>

Make 6 to 14 units. Spread targetDate values evenly from today to the deadline, leaving the last 15% of time for review if there is a deadline. Each unit gets 3 to 6 concrete concepts.`;
  const schema = {
    type: "object",
    properties: {
      overview: { type: "string", description: "2 to 3 sentence summary of the plan and strategy" },
      subjectType: {
        type: "string",
        enum: ["quantitative", "conceptual", "programming", "language", "memorization", "argument", "history"],
        description: "Best fit: quantitative (math, stats, physics), conceptual (biology, chemistry), programming, language, memorization (anatomy, pharmacology), argument (law, humanities), history",
      },
      units: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string", description: "One sentence" },
            concepts: { type: "array", items: { type: "string" } },
            targetDate: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["title", "summary", "concepts", "targetDate"],
        },
      },
    },
    required: ["overview", "subjectType", "units"],
  };
  return { system, content, schema };
}

// New lecture materials arrived: decide which new units (if any) to add to the plan.
export function extendPrompt(course, newText, label) {
  const system = `You maintain a study plan for ${course.name}. New materials from the teacher just arrived. Add units only for topics the existing plan does not already cover. If everything is already covered, return an empty list. ${goalGuidance(course.goal)}`;
  const content = `Today: ${new Date().toISOString().slice(0, 10)}
Deadline: ${course.deadline || "none"}
Existing units:
${course.units.map((u) => `- ${u.title}: ${u.concepts.join("; ")}`).join("\n")}

New materials${label ? ` (${label})` : ""}:
<materials>
${newText}
</materials>

Return 0 to 4 new units, each with 3 to 6 concepts and a targetDate between today and the deadline (about one week out if no deadline).`;
  const schema = {
    type: "object",
    properties: {
      note: { type: "string", description: "One sentence for the learner on what changed in the plan" },
      units: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            concepts: { type: "array", items: { type: "string" } },
            targetDate: { type: "string" },
          },
          required: ["title", "summary", "concepts", "targetDate"],
        },
      },
    },
    required: ["note", "units"],
  };
  return { system, content, schema };
}

export function tutorSystem({ course, unit, learner, summary, excerpts, otherLearners }) {
  return `You are Sensei, a patient, direct, playfully dramatic Japanese tutor helping ${learner} learn ${course.name} from zero. You may season replies with light dojo flavor (konnichiwa, ganbatte, deshi), but clarity first, theatrics second. The learner should do the thinking: you explain, ask, check, and correct.

Learner
- Goal: ${GOALS[course.goal]}. ${goalGuidance(course.goal)}
- Starting level: ${LEVELS[course.level]}
- Deadline: ${course.deadline || "none"}
- Progress: ${summary.done}/${summary.total} units done. Shaky concepts: ${summary.shaky.join(", ") || "none yet"}.
${otherLearners.length ? `- Studying together with ${otherLearners.join(", ")}.` : ""}

Current unit: ${unit.title}
Concepts: ${unit.concepts.join("; ")}

How to teach
1. Teach one concept at a time. Never dump a whole unit.
2. For each concept: plain-language explanation, then the correct term, one analogy, and one example from the course excerpts when available.
3. Then ask the learner to explain it back or answer one question. Wait for the answer before moving on.
4. If they are stuck, give a hint before the answer. If they are wrong, say so plainly and explain the specific misconception. No empty praise.
5. If a shaky concept is relevant, weave in a quick review question.
6. Keep replies short: under 180 words unless asked for more. Use markdown sparingly.
7. Stay consistent with the course excerpts; they reflect what the professor tests. If you go beyond them or are unsure of a fact, say so.
8. Adapt to the subject: for math and science problems, show one worked step and have the learner do the next; for memorization-heavy subjects (biology, languages, history, law), use recall questions and memory tricks; for skills (coding, writing), give short tasks and feedback.
9. ${langGuidance(course.language)}
10. Do not use em dashes.
11. When the learner asks for a specific method (analogy, diagram, summary sheet, exam tips), do that, then return to checking understanding.

When the learner has worked through all concepts in this unit, tell them to take the unit quiz.

Course excerpts relevant to this unit:
${excerpts}`;
}

export function quizPrompt({ course, units, summary, excerpts, count, diagnostic }) {
  const system = `You write multiple-choice questions for a learner studying ${course.name}. ${goalGuidance(course.goal)} Questions must be answerable from the unit concepts and be consistent with the course excerpts. Distractors should be plausible, based on common misconceptions. ${course.language === "zh" ? "Write questions in Simplified Chinese with key terms in English." : "Write questions in English."} Do not use em dashes.`;
  const content = `${diagnostic ? "This is a diagnostic to find what the learner already knows. Mix easy and medium questions across these units and include prerequisite knowledge." : "Mix recall, application, and one harder question."}
Units:
${units.map((u) => `- ${u.title}: ${u.concepts.join("; ")}`).join("\n")}
${summary.shaky.length ? `Shaky concepts to include if relevant: ${summary.shaky.join(", ")}` : ""}

Course excerpts:
${excerpts}

Write exactly ${count} questions, each with 4 options.`;
  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            q: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer: { type: "integer", description: "0-based index of the correct option" },
            explanation: { type: "string", description: "Why the answer is right and the misconception behind the likely wrong choice" },
            concept: { type: "string", description: "Short name of the concept tested" },
          },
          required: ["q", "options", "answer", "explanation", "concept"],
        },
      },
    },
    required: ["questions"],
  };
  return { system, content, schema };
}
