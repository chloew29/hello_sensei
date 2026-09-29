import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { getCourse, getProgress, saveProgress, today, addDays, daysBetween, newId, scheduleReview } from "@/lib/data";
import { gradeTyped } from "@/lib/grading";

const PASS = 0.8;
const RECALL_FOR_MASTERY = 0.6;
const CONFIDENCE = new Set(["sure", "unsure", "guess"]);

export const maxDuration = 60;

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { courseId, unitId, results, delayedCheck } = await req.json();
  const course = await getCourse(courseId);
  if (!course) return bad("Course not found", 404);
  if (!Array.isArray(results) || !results.length) return bad("No answers");

  const items = results.map((r) => ({
    q: String(r.q),
    options: r.options,
    answer: r.answer,
    explanation: r.explanation,
    concept: r.concept,
    chosen: r.chosen,
    typed: String(r.typed || "").slice(0, 1000),
    confidence: CONFIDENCE.has(r.confidence) ? r.confidence : null,
  }));
  let grades;
  try {
    grades = await gradeTyped(items, course.language);
  } catch {
    grades = items.map(() => ({ typedCorrect: false, errorType: "none", diagnosis: "" }));
  }

  const p = await getProgress(courseId, learner);
  const t = today();
  const score = items.filter((it) => it.chosen === it.answer).length;
  const recalled = grades.filter((g) => g.typedCorrect).length;
  const total = items.length;

  // Every question goes into review, not just misses.
  items.forEach((it, i) => {
    const g = grades[i];
    const correct = it.chosen === it.answer;
    const existing = p.review.find((r) => r.q === it.q);
    const base = existing || { id: newId(), unitId, q: it.q, options: it.options, answer: it.answer, explanation: it.explanation, concept: it.concept, createdAt: t };
    const next = scheduleReview(base, { recalled: g.typedCorrect, correct, confidence: it.confidence }, course.deadline);
    if (!correct || !g.typedCorrect) {
      next.lastTyped = it.typed;
      next.lastChosen = it.chosen;
      next.errorType = g.errorType;
      next.diagnosis = g.diagnosis;
    }
    if (existing) Object.assign(existing, next);
    else p.review.push(next);
  });
  p.review = p.review.slice(-400);

  let status = null;
  let message = "";
  if (unitId !== "diagnostic") {
    const u = p.units[unitId] || { status: "learning", best: 0, attempts: 0 };
    u.attempts += 1;
    u.best = Math.max(u.best || 0, Math.round((score / total) * 100));
    u.lastRecall = Math.round((recalled / total) * 100);
    const passed = score / total >= PASS;
    const isCheck = delayedCheck && ["learned", "done"].includes(u.status) && u.checkDue && u.checkDue <= t;
    if (u.status === "mastered") {
      message = "Already mastered. This counts as extra review.";
    } else if (isCheck) {
      if (passed && recalled / total >= RECALL_FOR_MASTERY) {
        u.status = "mastered";
        u.masteredAt = t;
        message = "Mastered. You still knew it days later, without help.";
      } else {
        u.checkDue = addDays(t, 2);
        message = "Not mastered yet. The missed questions are in your review, and the check comes back in 2 days.";
      }
    } else if (passed) {
      u.status = "learned";
      u.learnedAt = t;
      const daysLeft = course.deadline && course.deadline > t ? daysBetween(t, course.deadline) : 30;
      u.checkDue = addDays(t, Math.max(1, Math.min(3, daysLeft - 1)));
      message = `Learned. Come back for the mastery check on ${u.checkDue}; it only counts if you still know it then.`;
    } else {
      message = "Not yet. 80% marks a unit learned. Work on the missed concepts with the tutor, then retry.";
    }
    status = u.status;
    p.units[unitId] = u;
  } else {
    message = "Diagnostic done. Every question is now in your review, and the tutor knows your weak spots.";
  }
  p.history.push({ date: t, unitId, score, total, recalled });
  p.history = p.history.slice(-200);
  await saveProgress(courseId, learner, p);
  return Response.json({ score, recalled, total, status, message, grades });
}
