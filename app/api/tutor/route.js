import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { kvGet, kvSet, kvDel } from "@/lib/store";
import { getCourse, getChunks, getProgress, saveProgress, getLearners, learnerSummary } from "@/lib/data";
import { retrieve, formatExcerpts } from "@/lib/materials";
import { getKit } from "@/lib/kit";
import { tutorTurn, emptyState } from "@/lib/tutor";
import { learnerSummaryText } from "@/lib/pedagogy";
import { LEVELS as LEVEL_TEXT } from "@/lib/prompts";

export const maxDuration = 120;

const chatKey = (c, l, u) => `chat:${c}:${l}:${u}`;
const stateKey = (c, l, u) => `tstate:${c}:${l}:${u}`;
const ACTIONS = new Set(["stuck", "reveal", "check", "start"]);

export async function GET(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const [messages, state] = await Promise.all([
    kvGet(chatKey(sp.get("courseId"), learner, sp.get("unitId")), []),
    kvGet(stateKey(sp.get("courseId"), learner, sp.get("unitId")), null),
  ]);
  return Response.json({ messages, attempted: !!state?.attempted, hintRung: state?.hintRung || 0 });
}

export async function DELETE(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const sp = new URL(req.url).searchParams;
  await kvDel(chatKey(sp.get("courseId"), learner, sp.get("unitId")));
  await kvDel(stateKey(sp.get("courseId"), learner, sp.get("unitId")));
  return Response.json({ ok: true });
}

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { courseId, unitId, message, action } = await req.json();
  const course = await getCourse(courseId);
  const unit = course?.units.find((u) => u.id === unitId);
  if (!unit) return bad("Unit not found", 404);
  const act = ACTIONS.has(action) ? action : null;
  const text = String(message || "").trim().slice(0, 4000);
  if (!text && (!act || act === "check")) return bad("Empty message");

  const key = chatKey(courseId, learner, unitId);
  const sKey = stateKey(courseId, learner, unitId);
  const [history, state, progress, chunks, kit] = await Promise.all([
    kvGet(key, []),
    kvGet(sKey, emptyState()),
    getProgress(courseId, learner),
    getChunks(courseId),
    getKit(course, unit).catch(() => null),
  ]);

  if (!progress.units[unitId]) {
    progress.units[unitId] = { status: "learning", best: 0, attempts: 0 };
    await saveProgress(courseId, learner, progress);
  }

  const summary = learnerSummary(course, progress);
  const lastQuiz = [...progress.history].reverse().find((h) => h.unitId === unitId);
  const lSummary = learnerSummaryText({
    level: LEVEL_TEXT[course.level] || course.level,
    unitStatus: progress.units[unitId]?.status,
    recentQuiz: lastQuiz ? `${lastQuiz.score}/${lastQuiz.total}` : null,
    shaky: summary.shaky,
    state,
  });
  const excerpts = formatExcerpts(retrieve(chunks, `${unit.title} ${unit.concepts.join(" ")} ${text}`));
  const otherLearners = (await getLearners()).filter((n) => n !== learner);

  let turn;
  try {
    turn = await tutorTurn({ course, unit, learner, kit, excerpts, learnerSummary: lSummary, history: history.slice(-20), message: text, action: act, state, otherLearners });
  } catch (e) {
    return bad(e.message, 500);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const piece of turn.stream) controller.enqueue(encoder.encode(piece));
        const { reply, state: next, userText } = await turn.done;
        history.push({ role: "user", content: userText });
        history.push({ role: "assistant", content: reply || "(no reply)" });
        await kvSet(key, history.slice(-40));
        await kvSet(sKey, next);
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[Error: ${e.message}]`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
}
