import { NextResponse } from "next/server";
import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { OUTFITS, KISS_COST, getRewards, saveRewards } from "@/lib/rewards";

export async function GET() {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const r = await getRewards(learner);
  return NextResponse.json({ ...r, outfits: OUTFITS });
}

export async function POST(req) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { action, id } = await req.json().catch(() => ({}));
  const r = await getRewards(learner);

  if (action === "kiss") {
    if (r.petals < KISS_COST) return bad("花瓣不够哦 🌸 多答对几道题再来！");
    r.petals -= KISS_COST;
    r.kisses = (r.kisses || 0) + 1;
    await saveRewards(learner, r);
    return NextResponse.json({ ...r, outfits: OUTFITS, kissed: true });
  }

  const outfit = OUTFITS.find((o) => o.id === id);
  if (!outfit) return bad("Unknown outfit");

  if (action === "unlock") {
    if (r.unlocked.includes(id)) return bad("Already unlocked");
    if (r.petals < outfit.cost) return bad("花瓣不够哦 🌸 多答对几道题再来！");
    r.petals -= outfit.cost;
    r.unlocked.push(id);
    r.active = id;
  } else if (action === "wear") {
    if (!r.unlocked.includes(id)) return bad("Not unlocked yet");
    r.active = id;
  } else {
    return bad("Unknown action");
  }
  await saveRewards(learner, r);
  return NextResponse.json({ ...r, outfits: OUTFITS });
}
