import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { getCourse, getProgress, saveProgress, scheduleReview, today } from "@/lib/data";
import { gradeTyped } from "@/lib/grading";

export const maxDuration = 60;

export async function GET(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const courseId = sp.get("courseId");
  const p = await getProgress(courseId, learner);
  if (sp.get("notebook")) {
    const items = p.review.filter((r) => r.wrongCount > 0).sort((a, b) => (a.retired === b.retired ? (a.due < b.due ? -1 : 1) : a.retired ? 1 : -1));
    return Response.json({ items });
  }
  const t = today();
  const active = p.review.filter((r) => !r.retired);
  const due = active
    .filter((r) => r.due <= t)
    .sort((a, b) => (b.lastConfidence === "sure" && b.wrongCount) - (a.lastConfidence === "sure" && a.wrongCount) || (a.due < b.due ? -1 : 1))
    .slice(0, 20);
  const upcoming = active.filter((r) => r.due > t).length;
  return Response.json({ due, upcoming });
}

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const body = await req.json();
  const { courseId, itemId } = body;
  const course = await getCourse(courseId);
  if (!course) return bad("Course not found", 404);
  const p = await getProgress(courseId, learner);
  const i = p.review.findIndex((r) => r.id === itemId);
  if (i < 0) return bad("Review item not found", 404);
  const item = p.review[i];

  // Learner writes their own one-line correction in the mistake notebook.
  if (body.action === "note") {
    item.note = String(body.note || "").slice(0, 500);
    await saveProgress(courseId, learner, p);
    return Response.json({ ok: true });
  }

  const chosen = Number.isInteger(body.chosen) ? body.chosen : -1;
  const typed = String(body.typed || "").slice(0, 1000);
  const confidence = ["sure", "unsure", "guess"].includes(body.confidence) ? body.confidence : null;
  let g = { typedCorrect: false, errorType: "no_recall", diagnosis: "" };
  try {
    [g] = await gradeTyped([{ ...item, typed, chosen }], course.language);
  } catch {}
  const correct = chosen === item.answer;
  const next = scheduleReview(item, { recalled: g.typedCorrect, correct, confidence }, course.deadline);
  if (!correct || !g.typedCorrect) Object.assign(next, { lastTyped: typed, lastChosen: chosen, errorType: g.errorType, diagnosis: g.diagnosis });
  p.review[i] = next;
  p.history.push({ date: today(), unitId: "review", score: correct ? 1 : 0, total: 1, recalled: g.typedCorrect ? 1 : 0 });
  p.history = p.history.slice(-200);
  await saveProgress(courseId, learner, p);
  return Response.json({ ok: true, typedCorrect: g.typedCorrect, diagnosis: g.diagnosis, retired: next.retired, due: next.due, correctDays: next.correctDays.length });
}
