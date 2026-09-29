// Hidden teaching kit (answer key, misconceptions, worked example, practice) per unit.
// Generated once, fact-checked by a second pass, cached. Regenerated when materials change.
import { kvGet, kvSet } from "./store";
import { getChunks } from "./data";
import { retrieve, formatExcerpts } from "./materials";
import { aiJSON } from "./ai";
import { kitPrompt, verifyKitPrompt } from "./pedagogy";

const key = (courseId, unitId) => `kit:${courseId}:${unitId}`;

export function unitExcerpts(chunks, unit, extra = "") {
  return formatExcerpts(retrieve(chunks, `${unit.title} ${unit.concepts.join(" ")} ${extra}`, 6, 8000));
}

const MOCK_KIT = (unit) => ({
  objective: `Explain and apply ${unit.title}.`,
  prerequisite: "none",
  keyPoints: unit.concepts.map((c) => ({ point: `${c} explained.`, source: "general" })),
  misconceptions: [
    { id: "m1", name: "Mitochondria make energy from nothing", whyTempting: "They are called the powerhouse.", correction: "They convert energy stored in glucose into ATP.", diagnosticQuestion: "Where does the energy in ATP come from?" },
  ],
  workedExample: { problem: "Where is most ATP made?", steps: [{ step: "Recall the stages of respiration.", why: "Each stage makes a different amount." }], answer: "In the mitochondria, mostly by oxidative phosphorylation." },
  practice: [{ id: "p1", problem: "Which organelle makes most ATP?", answer: "Mitochondrion", solution: "Cellular respiration's final stages happen there.", misconceptionIds: ["m1"] }],
});

export async function getKit(course, unit) {
  const version = course.materialsVersion || 0;
  const cached = await kvGet(key(course.id, unit.id));
  if (cached && cached.version === version) return cached.kit;

  const chunks = await getChunks(course.id);
  const excerpts = unitExcerpts(chunks, unit);
  const draft = kitPrompt(course, unit, excerpts);
  let kit = await aiJSON({ ...draft, toolName: "answer_key", maxTokens: 6000, mock: () => MOCK_KIT(unit) });
  let issues = [];
  try {
    const check = verifyKitPrompt(course, unit, excerpts, kit);
    const out = await aiJSON({ ...check, toolName: "checked_answer_key", maxTokens: 7000, mock: () => ({ issues: [], kit }) });
    if (out?.kit?.practice?.length) {
      kit = out.kit;
      issues = out.issues || [];
    }
  } catch {
    // Keep the unverified draft rather than failing the lesson.
    issues = ["verification failed; draft kept"];
  }
  await kvSet(key(course.id, unit.id), { version, kit, issues, createdAt: new Date().toISOString() });
  return kit;
}
