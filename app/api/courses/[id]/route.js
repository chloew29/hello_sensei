import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { kvGet, kvSet, kvDel } from "@/lib/store";
import { COURSES_KEY, getCourse, getProgress, getLearners, learnerSummary } from "@/lib/data";

export async function GET(req, { params }) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return bad("Course not found", 404);
  const learners = await getLearners();
  const board = [];
  for (const name of learners) {
    const p = await getProgress(id, name);
    const s = learnerSummary(course, p);
    if (name === learner || p.history.length || Object.keys(p.units).length) {
      board.push({ name, ...s, units: p.units });
    }
  }
  const mine = await getProgress(id, learner);
  return Response.json({ course, learner, board, myUnits: mine.units, mySummary: learnerSummary(course, mine) });
}

export async function DELETE(req, { params }) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return bad("Course not found", 404);
  const ids = (await kvGet(COURSES_KEY, [])).filter((x) => x !== id);
  await kvSet(COURSES_KEY, ids);
  await kvDel(`course:${id}`);
  await kvDel(`chunks:${id}`);
  for (const name of await getLearners()) await kvDel(`progress:${id}:${name}`);
  return Response.json({ ok: true });
}
