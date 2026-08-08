import { Agent, run, setTracingDisabled, tool, webSearchTool } from "@openai/agents";
import { z } from "zod";
import { readFileSync } from "node:fs";

const env = readFileSync("/Users/drosihan1/Documents/Projects/craig/.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
setTracingDisabled(true);

const p = z.object({ key: z.string(), value: z.string() });
const recordFact = tool({
  name: "record_fact",
  description: "Record one concrete fact. One fact per call.",
  parameters: p,
  execute: ({ key, value }) => `Got it: ${key} — ${value}`,
});

async function trial(label, tools, instructions) {
  const result = await run(
    new Agent({ name: "P", instructions, model: "gpt-4o-mini", modelSettings: { temperature: 0.3, maxTokens: 900 }, tools }),
    "Hi Craig. We're a four-person studio in Sydney and I'm hiring our first designer. Everyone's employed here in Australia.",
    { stream: true, maxTurns: 8 },
  );
  const called = [];
  for await (const e of result) {
    if (e.type === "run_item_stream_event" && e.name === "tool_called")
      called.push(e.item.rawItem?.name ?? e.item.rawItem?.type);
  }
  console.log(`${label}: ${called.join(", ") || "(none)"}`);
}

const RULE = `You are Craig. Record every fact you are told with record_fact, one call each, before replying.
When she names the country her people are employed in, you MUST also call web_search for "right to work check <country> what employers must verify" in that same turn.`;

await trial("web_search only          ", [webSearchTool({ searchContextSize: "low" })], RULE);
await trial("record_fact + web_search ", [recordFact, webSearchTool({ searchContextSize: "low" })], RULE);
await trial("web_search listed first  ", [webSearchTool({ searchContextSize: "low" }), recordFact], RULE);
