#!/usr/bin/env npx tsx
import { program } from "commander";

const API_BASE = process.env.DIARY_API_URL || "http://localhost:3210";

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Error ${res.status}: ${err}`);
    process.exit(1);
  }
  return res.json();
}

program.name("dictionary").description("context-dictionary CLI").version("0.1.0");

program
  .command("add")
  .description("Create a new diary entry")
  .requiredOption("-a, --agent <agent>", "Agent name (e.g. claude-code, copilot-cli)")
  .requiredOption("-s, --summary <summary>", "Summary of the session")
  .option("-t, --tags <tags>", "Comma-separated tags", "")
  .option("-m, --mood <mood>", "Mood (productive, stuck, exploratory, debugging)")
  .option("-l, --learnings <items>", "Comma-separated learnings", "")
  .option("--session <id>", "Session ID")
  .action(async (opts) => {
    const body: Record<string, unknown> = {
      agent: opts.agent,
      summary: opts.summary,
    };
    if (opts.tags) body.tags = opts.tags.split(",").map((s: string) => s.trim());
    if (opts.mood) body.mood = opts.mood;
    if (opts.learnings)
      body.learnings = opts.learnings.split(",").map((s: string) => s.trim());
    if (opts.session) body.sessionId = opts.session;

    const entry = await api("/api/entries", {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`Created entry #${entry.id}`);
  });

program
  .command("list")
  .description("List diary entries")
  .option("-a, --agent <agent>", "Filter by agent")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("-n, --limit <n>", "Number of entries", "10")
  .action(async (opts) => {
    const params = new URLSearchParams();
    if (opts.agent) params.set("agent", opts.agent);
    if (opts.tag) params.set("tag", opts.tag);
    params.set("limit", opts.limit);

    const entries = await api(`/api/entries?${params}`);
    for (const e of entries) {
      const tags = e.tags.map((t: { tag: { name: string } }) => t.tag.name).join(", ");
      const date = new Date(e.createdAt).toLocaleString("ja-JP");
      console.log(`#${e.id} [${e.agent}] ${date} ${e.mood || ""}`);
      console.log(`  ${e.summary}`);
      if (tags) console.log(`  tags: ${tags}`);
      console.log();
    }
  });

program
  .command("show <id>")
  .description("Show a single entry in detail")
  .action(async (id) => {
    const e = await api(`/api/entries/${id}`);
    const tags = e.tags.map((t: { tag: { name: string } }) => t.tag.name).join(", ");
    console.log(`#${e.id} [${e.agent}] ${new Date(e.createdAt).toLocaleString("ja-JP")}`);
    console.log(`Mood: ${e.mood || "-"}`);
    console.log(`Summary: ${e.summary}`);
    if (tags) console.log(`Tags: ${tags}`);
    if (e.learnings?.length) {
      console.log("Learnings:");
      for (const l of e.learnings) console.log(`  - ${l}`);
    }
    if (e.decisions?.length) {
      console.log("Decisions:");
      for (const d of e.decisions)
        console.log(`  - ${d.decision} (${d.rationale})`);
    }
    if (e.followUps?.length) {
      console.log("Follow-ups:");
      for (const f of e.followUps)
        console.log(`  ${f.resolved ? "[x]" : "[ ]"} ${f.content}`);
    }
  });

program
  .command("search <query>")
  .description("Search entries")
  .action(async (query) => {
    const entries = await api(`/api/search?q=${encodeURIComponent(query)}`);
    if (!entries.length) {
      console.log("No results found.");
      return;
    }
    for (const e of entries) {
      const date = new Date(e.createdAt).toLocaleString("ja-JP");
      console.log(`#${e.id} [${e.agent}] ${date}`);
      console.log(`  ${e.summary}`);
      console.log();
    }
  });

program.parse();
