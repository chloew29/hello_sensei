import { createHash } from "crypto";
import { cookies } from "next/headers";

// One shared passcode for the app (APP_PASSCODE). Each person picks a learner name.
export function passToken(pass) {
  return createHash("sha256").update(`study-buddy:${pass}`).digest("hex");
}

export async function currentLearner() {
  const c = await cookies();
  const auth = c.get("sb_auth")?.value;
  const name = c.get("sb_learner")?.value;
  const expected = passToken(process.env.APP_PASSCODE || "study");
  if (!auth || auth !== expected || !name) return null;
  return decodeURIComponent(name);
}

export function unauthorized() {
  return Response.json({ error: "Not signed in" }, { status: 401 });
}

export function bad(msg, status = 400) {
  return Response.json({ error: msg }, { status });
}
