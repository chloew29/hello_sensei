import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { kvGet, kvSet } from "@/lib/store";
import { COURSES_KEY, listCourses, saveCourse, saveChunks, getProgress, learnerSummary, newId, getLearners, today, addDays } from "@/lib/data";
import { extractFile, chunkText } from "@/lib/materials";
import { aiJSON } from "@/lib/ai";
import { planPrompt, GOALS, LEVELS, LANGS } from "@/lib/prompts";

export const maxDuration = 120;

export async function GET() {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const courses = await listCourses();
  const out = await Promise.all(
    courses.map(async (c) => ({
      id: c.id,
      name: c.name,
      goal: c.goal,
      deadline: c.deadline,
      mine: learnerSummary(c, await getProgress(c.id, learner)),
    }))
  );
  return Response.json({ courses: out });
}

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const form = await req.formData();
  const course = {
    id: newId(),
    name: String(form.get("name") || "").trim(),
    goal: String(form.get("goal") || "understand"),
    deadline: String(form.get("deadline") || ""),
    level: String(form.get("level") || "none"),
    minutesPerDay: Number(form.get("minutesPerDay") || 30),
    language: String(form.get("language") || "en"),
    notes: String(form.get("notes") || "").trim(),
    createdBy: learner,
    createdAt: today(),
  };
  if (!course.name) return bad("Give the course a name");
  if (!GOALS[course.goal] || !LEVELS[course.level] || !LANGS[course.language]) return bad("Invalid option");

  // Materials
  const chunks = [];
  const failed = [];
  for (const f of form.getAll("files")) {
    if (!f || typeof f === "string" || !f.size) continue;
    try {
      const { source, text } = await extractFile(f);
      if (text?.trim()) chunks.push(...chunkText(source, text));
      else failed.push(`${f.name} (no text found)`);
    } catch (e) {
      failed.push(`${f.name} (${e.message})`);
    }
  }
  const pasted = String(form.get("pasted") || "").trim();
  if (pasted) chunks.push(...chunkText("Pasted notes", pasted));

  // Plan from the first ~60k characters of materials
  const materialText = chunks.map((c) => `[${c.source}] ${c.text}`).join("\n\n").slice(0, 60000);
  const { system, content, schema } = planPrompt(course, materialText);
  const deadline = course.deadline || addDays(today(), 56);
  let plan;
  try {
    plan = await aiJSON({
      system,
      content,
      schema,
      toolName: "study_plan",
      maxTokens: 6000,
      mock: {
        overview: "Mock plan: prerequisites first, then core units, then review.",
        subjectType: "conceptual",
        units: ["Basic chemistry for biology", "Cells and organelles", "Membranes and transport", "Energy and metabolism", "DNA and genes", "Review"].map((t, i) => ({
          title: t,
          summary: `About ${t.toLowerCase()}.`,
          concepts: ["Concept A", "Concept B", "Concept C"],
          targetDate: addDays(today(), (i + 1) * 7),
        })),
      },
    });
  } catch (e) {
    return bad(`Could not build the plan: ${e.message}`, 500);
  }
  course.overview = plan.overview;
  course.subjectType = plan.subjectType || "conceptual";
  course.materialsVersion = 1;
  course.units = plan.units.map((u, i) => ({ id: `u${i + 1}`, ...u, targetDate: u.targetDate || deadline }));
  course.materialSources = [...new Set(chunks.map((c) => c.source))];

  await saveCourse(course);
  await saveChunks(course.id, chunks);
  const ids = await kvGet(COURSES_KEY, []);
  ids.unshift(course.id);
  await kvSet(COURSES_KEY, ids);
  return Response.json({ id: course.id, failed });
}
