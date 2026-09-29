// Turn uploaded files into text, split into chunks, and retrieve relevant chunks for a query.
import { aiText } from "./ai";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function extractFile(file) {
  const name = file.name || "file";
  const lower = name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return { source: name, text };
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { source: name, text: value };
  }
  if (lower.endsWith(".pptx")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const parts = [];
    for (const [i, f] of slides.entries()) {
      const xml = await zip.files[f].async("string");
      const words = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
      if (words.length) parts.push(`[Slide ${i + 1}] ${words.join(" ")}`);
    }
    return { source: name, text: parts.join("\n\n") };
  }
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) {
    if (buf.length > MAX_IMAGE_BYTES) throw new Error(`${name} is over 5 MB. Take a smaller photo.`);
    const media = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : lower.endsWith(".gif") ? "image/gif" : "image/jpeg";
    const text = await aiText({
      system: "You transcribe study materials. Output only the content, as clean text. Describe diagrams briefly in [brackets].",
      content: [
        { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
        { type: "text", text: "Transcribe everything on this slide, page, or board." },
      ],
      mock: `Transcribed content of ${name}`,
    });
    return { source: name, text };
  }
  // txt, md, csv and anything else: treat as text
  return { source: name, text: buf.toString("utf8") };
}

function decodeXml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function chunkText(source, text, size = 1200) {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const paras = clean.split(/\n\n+/);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      chunks.push(cur);
      cur = "";
    }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.map((t) => ({ source, text: t }));
}

// Words for English, character pairs for Chinese.
function tokens(s) {
  const out = [];
  const lower = s.toLowerCase();
  for (const w of lower.match(/[a-z0-9]{3,}/g) || []) if (!STOP.has(w)) out.push(w);
  const cjk = lower.match(/[一-鿿]+/g) || [];
  for (const run of cjk) for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  return out;
}
const STOP = new Set("the and for are with that this from what which into have has was were will your you they their them then than there these those can not but how why when where who its our out about also more most some such only each other".split(" "));

export function retrieve(chunks, query, k = 5, maxChars = 6000) {
  if (!chunks?.length) return [];
  const q = [...new Set(tokens(query))];
  if (!q.length) return chunks.slice(0, k);
  const df = {};
  const toks = chunks.map((c) => {
    const t = tokens(c.text);
    const set = new Set(t);
    for (const w of set) df[w] = (df[w] || 0) + 1;
    return t;
  });
  const N = chunks.length;
  const scored = chunks.map((c, i) => {
    const tf = {};
    for (const w of toks[i]) tf[w] = (tf[w] || 0) + 1;
    let s = 0;
    for (const w of q) if (tf[w]) s += (1 + Math.log(tf[w])) * Math.log(1 + N / (df[w] || 1));
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const out = [];
  let total = 0;
  for (const { c, s } of scored) {
    if (out.length >= k || s <= 0) break;
    if (total + c.text.length > maxChars) continue;
    out.push(c);
    total += c.text.length;
  }
  return out;
}

export function formatExcerpts(chunks) {
  if (!chunks.length) return "(No course materials uploaded for this topic. Teach from general knowledge and say so.)";
  return chunks.map((c, i) => `<excerpt id="E${i + 1}" source="${c.source}">\n${c.text}\n</excerpt>`).join("\n");
}
