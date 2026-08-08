import { Agent, run, setTracingDisabled, webSearchTool } from "@openai/agents";
import { readFileSync } from "node:fs";

const env = readFileSync("/Users/drosihan1/Documents/Projects/craig/.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
setTracingDisabled(true);

const agent = new Agent({
  name: "Probe",
  instructions: "You answer briefly. Use web_search when asked to look something up.",
  model: "gpt-4o-mini",
  modelSettings: { temperature: 0.3, maxTokens: 400 },
  tools: [webSearchTool({ searchContextSize: "low" })],
});

const result = await run(agent, "Look up which right-to-work check applies to employees in Australia. Name it.", { stream: true, maxTurns: 5 });

for await (const e of result) {
  if (e.type === "raw_model_stream_event" && e.data.type === "model") {
    const ev = e.data.event;
    if (typeof ev?.type === "string" && ev.type.includes("web_search"))
      console.log("RAW:", ev.type, ev.item?.id ?? "");
    if (ev?.type === "response.output_item.added" || ev?.type === "response.output_item.done")
      console.log("ITEM:", ev.type, ev.item?.type, ev.item?.id);
  }
  if (e.type === "run_item_stream_event")
    console.log("RUNITEM:", e.name, e.item.rawItem?.type, e.item.rawItem?.name);
}
console.log("\nFINAL:", result.finalOutput);
