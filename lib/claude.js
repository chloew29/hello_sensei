import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
// Smaller, cheaper model for grading, answer checks, and eval judging.
export const CHECK_MODEL = process.env.CHECK_MODEL || "claude-haiku-4-5";
export const MOCK = !process.env.ANTHROPIC_API_KEY && process.env.MOCK_AI === "1";

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  if (!client) client = new Anthropic();
  return client;
}

// Ask Claude for structured JSON by forcing a single tool call.
export async function claudeJSON({ system, content, toolName, schema, maxTokens = 4000, model = MODEL, mock }) {
  if (MOCK) return typeof mock === "function" ? mock() : mock;
  const res = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [{ name: toolName, description: `Return the ${toolName} result.`, input_schema: schema }],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block) throw new Error("Claude did not return structured output.");
  return block.input;
}

// Plain text completion.
export async function claudeText({ system, content, messages, maxTokens = 4000, model = MODEL, mock }) {
  if (MOCK) return typeof mock === "function" ? mock() : mock;
  const res = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: messages || [{ role: "user", content }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// Async generator of text deltas.
export async function* claudeRawStream({ system, messages, maxTokens = 1500, model = MODEL, mock }) {
  if (MOCK) {
    const text = typeof mock === "function" ? mock() : mock;
    for (const piece of text.match(/[\s\S]{1,12}/g) || []) yield piece;
    return;
  }
  const stream = await getClient().messages.create({ model, max_tokens: maxTokens, system, messages, stream: true });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield ev.delta.text;
  }
}
