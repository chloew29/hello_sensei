import { kvGet, kvSet } from "./store";

export const LEARNERS_KEY = "learners";
export const COURSES_KEY = "courses:index";

export const today = () => new Date().toISOString().slice(0, 10);
export const newId = () => Math.random().toString(36).slice(2, 10);

export async function listCourses() {
  const ids = await kvGet(COURSES_KEY, []);
  const courses = await Promise.all(ids.map((id) => kvGet(`course:${id}`)));
  return courses.filter(Boolean);
}

export const getCourse = (id) => kvGet(`course:${id}`);
export const saveCourse = (c) => kvSet(`course:${c.id}`, c);
export const getChunks = (id) => kvGet(`chunks:${id}`, []);
export const saveChunks = (id, chunks) => kvSet(`chunks:${id}`, chunks);

export async function getProgress(courseId, learner) {
  return kvGet(`progress:${courseId}:${learner}`, { units: {}, review: [], history: [] });
}
export const saveProgress = (courseId, learner, p) => kvSet(`progress:${courseId}:${learner}`, p);

export async function addLearner(name) {
  const list = await kvGet(LEARNERS_KEY, []);
  if (!list.includes(name)) {
    list.push(name);
    await kvSet(LEARNERS_KEY, list);
  }
  return list;
}
export const getLearners = () => kvGet(LEARNERS_KEY, []);

// Leitner boxes: a missed question comes back tomorrow; each correct review pushes it further out.
const INTERVALS = [1, 2, 4, 8, 16];
export function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
}

// Deadline-aware spacing (Cepeda 2008): gaps grow with each correct recall but are capped at
// about 20% of the days left before the exam, and every active item gets a review in the last days.
// An item is cleared after correct typed recall on 3 separate days (successive relearning).
export function scheduleReview(item, { recalled, correct, confidence }, deadline) {
  const t = today();
  const it = { correctDays: [], wrongCount: 0, box: 0, ...item };
  it.correctDays = [...it.correctDays];
  it.lastConfidence = confidence || null;
  const daysLeft = deadline && deadline > t ? daysBetween(t, deadline) : null;

  let gap;
  if (!correct) {
    it.box = 0;
    it.wrongCount += 1;
    gap = confidence === "sure" ? 0 : 1; // confident errors come back the same session
  } else if (!recalled || confidence === "guess") {
    it.box = Math.max(0, it.box - 1);
    gap = 1;
  } else {
    if (!it.correctDays.includes(t)) it.correctDays.push(t);
    it.box = Math.min(it.box + 1, INTERVALS.length - 1);
    gap = confidence === "unsure" ? Math.min(INTERVALS[it.box], 2) : INTERVALS[it.box];
  }
  if (daysLeft) {
    gap = Math.min(gap, Math.max(1, Math.round(daysLeft * 0.2)), daysLeft);
    if (!correct && confidence === "sure") gap = 0;
  }
  it.due = addDays(t, gap);
  // Guarantee a review 2 days before the exam for anything still active.
  if (daysLeft && daysLeft > 3 && it.due > addDays(deadline, -2)) it.due = addDays(deadline, -2);
  it.retired = it.correctDays.length >= 3;
  return it;
}

export const DONE_STATUSES = new Set(["learned", "mastered", "done"]);

export function learnerSummary(course, progress) {
  const units = course.units || [];
  const t = today();
  const done = units.filter((u) => DONE_STATUSES.has(progress.units[u.id]?.status)).length;
  const mastered = units.filter((u) => progress.units[u.id]?.status === "mastered").length;
  const checks = units.filter((u) => {
    const s = progress.units[u.id];
    return s && (s.status === "learned" || s.status === "done") && s.checkDue && s.checkDue <= t;
  }).map((u) => u.id);
  const active = progress.review.filter((r) => !r.retired);
  const due = active.filter((r) => r.due <= t).length;
  const last = progress.history.filter((h) => h.unitId !== "review").slice(-5);
  const streak = studyStreak(progress.history);
  const shaky = [...new Set(active.filter((r) => r.wrongCount > 0).map((r) => r.concept).filter(Boolean))].slice(0, 8);
  const notebook = progress.review.filter((r) => r.wrongCount > 0 && !r.retired).length;
  return { done, mastered, checks, total: units.length, due, last, shaky, streak, notebook };
}

// Consecutive days (ending today or yesterday) with any quiz or review activity.
function studyStreak(history) {
  const days = new Set(history.map((h) => h.date));
  let d = today();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
