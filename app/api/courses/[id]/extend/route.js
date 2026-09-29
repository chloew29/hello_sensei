import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { getCourse, saveCourse, getChunks, today, addDays } from "@/lib/data";
import { claudeJSON } from "@/lib/claude";
import { extendPrompt } from "@/lib/prompts";

export const maxDuration = 120;

// After new materials are uploaded, add units for any new topics they cover.
export async function POST(req, { params }) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { id } = await params;
  const { sources, label } = await req.json();
  const course = await getCourse(id);
  if (!course) return bad("Course not found", 404);
  const set = new Set(sources || []);
  const text = (await getChunks(id))
    .filter((c) => set.has(c.source))
    .map((c) => `[${c.source}] ${c.text}`)
    .join("\n\n")
    .slice(0, 40000);
  if (!text) return Response.json({ note: "No readable text in the new materials.", added: [] });

  const { system, content, schema } = extendPrompt(course, text, label);
  try {
    const out = await claudeJSON({
      system,
      content,
      schema,
      toolName: "plan_update",
      maxTokens: 3000,
      mock: { note: "Added one unit for the new lecture.", units: [{ title: "New lecture topic", summary: "From the new slides.", concepts: ["Idea 1", "Idea 2", "Idea 3"], targetDate: addDays(today(), 7) }] },
    });
    const start = course.units.reduce((m, u) => Math.max(m, Number(u.id.slice(1)) || 0), 0);
    const added = (out.units || []).slice(0, 4).map((u, i) => ({ id: `u${start + i + 1}`, ...u, fromMaterials: label || [...set].join(", ") }));
    // Keep units in date order, with any trailing review unit last.
    let units = [...course.units];
    const last = units[units.length - 1];
    const review = last && /review|复习/i.test(last.title) ? units.pop() : null;
    units = [...units, ...added].sort((a, b) => (a.targetDate || "").localeCompare(b.targetDate || ""));
    if (review) units.push(review);
    course.units = units;
    await saveCourse(course);
    return Response.json({ note: out.note, added: added.map((u) => u.title) });
  } catch (e) {
    return bad(`Could not update the plan: ${e.message}`, 500);
  }
}
