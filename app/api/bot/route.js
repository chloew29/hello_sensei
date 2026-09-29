import { NextResponse } from "next/server";
import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { kvGet, kvSet } from "@/lib/store";
import { aiText } from "@/lib/ai";

const key = (learner) => `notes:${learner}`;

export async function GET() {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  return NextResponse.json({ notes: await kvGet(key(learner), []) });
}

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { action, text, target } = await req.json().catch(() => ({}));

  if (action === "note") {
    if (!text?.trim()) return bad("Empty note");
    const notes = await kvGet(key(learner), []);
    notes.unshift({
      id: `${Date.now()}`,
      text: text.trim().slice(0, 2000),
      at: new Date().toISOString(),
    });
    const kept = notes.slice(0, 50);
    await kvSet(key(learner), kept);
    return NextResponse.json({ notes: kept });
  }

  if (action === "translate") {
    if (!text?.trim()) return bad("Empty text");
    const to = target === "en" ? "English" : "Simplified Chinese";
    let result;
    try {
      result = await aiText(
        [
          {
            role: "system",
            content: `You are a translator. Translate the user's text into ${to}. Return ONLY the translation, no explanations, no quotation marks around it.`,
          },
          { role: "user", content: text.trim().slice(0, 2000) },
        ],
        { maxTokens: 800 }
      );
    } catch (e) {
      return bad(`AI request failed: ${e.message}`, 502);
    }
    return NextResponse.json({ result });
  }

  return bad("Unknown action");
}

export async function DELETE(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  const notes = (await kvGet(key(learner), [])).filter((n) => n.id !== id);
  await kvSet(key(learner), notes);
  return NextResponse.json({ notes });
}
