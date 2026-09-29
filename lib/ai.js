// AI client: OpenAI-compatible chat completions over plain fetch.
// Default is Google's Gemini free tier (key from https://aistudio.google.com/apikey).
// Point AI_BASE_URL at any OpenAI-compatible endpoint to switch providers
// (DeepSeek, OpenRouter, OpenAI, a local model, ...) with no code changes.

const BASE_URL = (process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");

export const MODEL = process.env.AI_MODEL || "gemini-2.5-flash";
// Cheaper model for grading, answer checks, and eval judging. Defaults to the main model.
export const CHECK_MODEL = process.env.AI_CHECK_MODEL || MODEL;
export const MOCK = !process.env.AI_API_KEY && process.env.MOCK_AI === "1";

function headers() {
  if (!process.env.AI_API_KEY) {
    throw new Error("AI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it under Vercel project Settings > Environment Variables.");
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` };
}

async function chatCompletions({ system, messages, maxTokens, model, stream = false, jsonMode = false }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: model || MODEL,
      max_tokens: maxTokens,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      ...(stream ? { stream: true } : {}),
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

function parseJSON(text, toolName) {
  const clean = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch { /* fall through to extraction */ }
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch { /* fall through */ }
  }
  throw new Error(`AI did not return valid JSON${toolName ? ` for ${toolName}` : ""}.`);
}

// Ask the model for structured JSON. `schema` is described in the prompt and the
// provider is asked for JSON object mode; parsing is tolerant of fences/prose.
export async function aiJSON({ system, content, toolName, schema, maxTokens = 4000, model = MODEL, mock }) {
  if (MOCK) return typeof mock === "function" ? mock() : mock;
  const schemaText = schema
    ? `\n\nRespond with a single JSON object matching this schema. No markdown fences, no commentary, no extra text:\n${JSON.stringify(schema)}`
    : `\n\nRespond with a single JSON object. No markdown fences, no commentary, no extra text.`;
  const res = await chatCompletions({
    system: `${system || ""}${schemaText}`,
    messages: [{ role: "user", content }],
    maxTokens,
    model,
    jsonMode: true,
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return parseJSON(text, toolName);
}

// Plain text completion.
export async function aiText({ system, content, messages, maxTokens = 4000, model = MODEL, mock }) {
  if (MOCK) return typeof mock === "function" ? mock() : mock;
  const res = await chatCompletions({ system, messages: messages || [{ role: "user", content }], maxTokens, model });
  const data = await res.json();
  return (data.choices || []).map((c) => c.message?.content || "").join("\n");
}

// Async generator of text deltas from a streaming chat completion.
export async function* aiStream({ system, messages, maxTokens = 1500, model = MODEL, mock }) {
  if (MOCK) {
    const text = typeof mock === "function" ? mock() : mock;
    for (const piece of String(text).match(/[\s\S]{1,12}/g) || []) yield piece;
    return;
  }
  const res = await chatCompletions({ system, messages, maxTokens, model, stream: true });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* partial line; keep buffering */ }
    }
  }
}
