import { currentLearner, unauthorized, bad } from "@/lib/auth";
import { getCourse, saveCourse, getChunks, saveChunks } from "@/lib/data";
import { extractFile, chunkText } from "@/lib/materials";

export const maxDuration = 120;

// Add more lecture slides or notes to an existing course.
export async function POST(req, { params }) {
  const learner = await currentLearner();
  if (!learner) return unauthorized();
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return bad("Course not found", 404);
  const form = await req.formData();
  const chunks = await getChunks(id);
  const added = [];
  const failed = [];
  for (const f of form.getAll("files")) {
    if (!f || typeof f === "string" || !f.size) continue;
    try {
      const { source, text } = await extractFile(f);
      if (!text?.trim()) {
        failed.push(`${f.name} (no text found)`);
        continue;
      }
      chunks.push(...chunkText(source, text));
      added.push(source);
    } catch (e) {
      failed.push(`${f.name} (${e.message})`);
    }
  }
  const pasted = String(form.get("pasted") || "").trim();
  if (pasted) {
    chunks.push(...chunkText("Pasted notes", pasted));
    added.push("Pasted notes");
  }
  await saveChunks(id, chunks);
  course.materialSources = [...new Set([...(course.materialSources || []), ...added])];
  if (added.length) course.materialsVersion = (course.materialsVersion || 0) + 1; // answer keys regenerate
  await saveCourse(course);
  return Response.json({ added, failed });
}
