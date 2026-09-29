import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { getCourse, getChunks, getProgress, learnerSummary, today } from "@/lib/data";
import { retrieve, formatExcerpts } from "@/lib/materials";
import { aiJSON } from "@/lib/ai";
import { quizPrompt } from "@/lib/prompts";
import { getKit } from "@/lib/kit";
import { formatKit } from "@/lib/pedagogy";
import { verifyQuestions } from "@/lib/grading";

export const maxDuration = 120;

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { courseId, unitId } = await req.json();
  const course = await getCourse(courseId);
  if (!course) return bad("Course not found", 404);
  const diagnostic = unitId === "diagnostic";
  const units = diagnostic ? course.units.slice(0, 3) : course.units.filter((u) => u.id === unitId);
  if (!units.length) return bad("Unit not found", 404);

  const progress = await getProgress(courseId, learner);
  const unitState = progress.units[unitId];
  const delayedCheck = !diagnostic && unitState && ["learned", "done"].includes(unitState.status) && unitState.checkDue && unitState.checkDue <= today();

  const chunks = await getChunks(courseId);
  const query = units.map((u) => `${u.title} ${u.concepts.join(" ")}`).join(" ");
  const excerpts = formatExcerpts(retrieve(chunks, query, 6, 8000));
  const kit = diagnostic ? null : await getKit(course, units[0]).catch(() => null);
  const kitText = kit ? formatKit(kit) : "";
  const count = diagnostic ? 8 : 6; // one extra so the self-check can drop a bad item
  const { system, content, schema } = quizPrompt({ course, units, summary: learnerSummary(course, progress), excerpts, count, diagnostic });
  const extra = kit
    ? `\n\nVerified answer key and common misconceptions for this unit (base answers on it; make each wrong option match one of these misconceptions where possible):\n${kitText}`
    : "";

  try {
    const out = await aiJSON({
      system,
      content: content + extra,
      schema,
      toolName: "quiz",
      maxTokens: 5000,
      mock: {
        questions: Array.from({ length: count }, (_, i) => ({
          q: `Mock question ${i + 1}: which organelle makes most of a cell's ATP?`,
          options: ["Nucleus", "Mitochondrion", "Ribosome", "Golgi apparatus"],
          answer: 1,
          explanation: "Mitochondria run cellular respiration, which produces most ATP.",
          concept: "Mitochondria",
        })),
      },
    });
    let questions = (out.questions || []).filter(
      (q) => Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length
    );
    questions = (await verifyQuestions(questions, kitText)).slice(0, diagnostic ? 8 : 5);
    if (!questions.length) return bad("Quiz generation failed. Try again.", 500);
    const title = diagnostic ? "Diagnostic" : delayedCheck ? `Mastery check: ${units[0].title}` : units[0].title;
    return Response.json({ questions, title, delayedCheck: !!delayedCheck });
  } catch (e) {
    return bad(`Quiz generation failed: ${e.message}`, 500);
  }
}
