import { currentLearner, unauthorized } from "@/lib/auth";
import { getLearners } from "@/lib/data";

export async function GET() {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  return Response.json({ learner, learners: await getLearners() });
}
