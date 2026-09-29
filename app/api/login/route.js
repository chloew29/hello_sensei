import { cookies } from "next/headers";
import { passToken, bad } from "@/lib/auth";
import { addLearner } from "@/lib/data";

export async function POST(req) {
  const { passcode, name } = await req.json();
  const expected = process.env.APP_PASSCODE || "study";
  if ((passcode || "").trim() !== expected) return bad("Wrong passcode", 401);
  const clean = (name || "").trim().slice(0, 30);
  if (!clean) return bad("Enter your name");
  await addLearner(clean);
  const c = await cookies();
  const opts = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" };
  c.set("sb_auth", passToken(expected), opts);
  c.set("sb_learner", encodeURIComponent(clean), opts);
  return Response.json({ ok: true, learner: clean });
}

export async function DELETE() {
  const c = await cookies();
  c.delete("sb_auth");
  c.delete("sb_learner");
  return Response.json({ ok: true });
}
