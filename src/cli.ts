#!/usr/bin/env npx tsx
import { program } from "commander";

const API_BASE = process.env.DICTIONARY_API_URL || "http://localhost:3210";

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

program.name("dictionary").description("context-dictionary CLI").version("0.2.0");

program
  .command("add")
  .description("Register a new insight")
  .requiredOption("-T, --type <type>", "Type: discovery, decision, solution, issue, caveat")
  .requiredOption("-c, --content <content>", "Insight content")
  .requiredOption("-a, --agent <agent>", "Agent name")
  .option("-d, --detail <detail>", "Detailed description")
  .option("-r, --rationale <rationale>", "Rationale (for decisions)")
  .option("--repo <repo>", "Repository name")
  .option("--branch <branch>", "Branch name")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .option("--session <id>", "Session ID")
  .action(async (opts) => {
    const body: Record<string, unknown> = {
      type: opts.type,
      content: opts.content,
      agent: opts.agent,
    };
    if (opts.detail) body.detail = opts.detail;
    if (opts.rationale) body.rationale = opts.rationale;
    if (opts.repo) body.repo = opts.repo;
    if (opts.branch) body.branch = opts.branch;
    if (opts.tags) body.tags = opts.tags.split(",").map((s: string) => s.trim());
    if (opts.session) body.sessionId = opts.session;

    const insight = await api("/api/insights", {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`Created insight #${insight.id} [${insight.type}]`);
  });

program
  .command("list")
  .description("List insights")
  .option("-a, --agent <agent>", "Filter by agent")
  .option("-T, --type <type>", "Filter by type")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("-r, --repo <repo>", "Filter by repo")
  .option("-n, --limit <n>", "Number of entries", "10")
  .action(async (opts) => {
    const params = new URLSearchParams();
    if (opts.agent) params.set("agent", opts.agent);
    if (opts.type) params.set("type", opts.type);
    if (opts.tag) params.set("tag", opts.tag);
    if (opts.repo) params.set("repo", opts.repo);
    params.set("limit", opts.limit);

    const insights = await api(`/api/insights?${params}`);
    for (const i of insights) {
      const tags = i.tags.map((t: { tag: { name: string } }) => t.tag.name).join(", ");
      const date = new Date(i.createdAt).toLocaleString("ja-JP");
      console.log(`#${i.id} [${i.type}] ${date} (${i.agent})`);
      console.log(`  ${i.content}`);
      if (i.rationale) console.log(`  reason: ${i.rationale}`);
      if (tags) console.log(`  tags: ${tags}`);
      console.log();
    }
  });

program
  .command("show <id>")
  .description("Show a single insight in detail")
  .action(async (id) => {
    const i = await api(`/api/insights/${id}`);
    const tags = i.tags.map((t: { tag: { name: string } }) => t.tag.name).join(", ");
    console.log(`#${i.id} [${i.type}] ${new Date(i.createdAt).toLocaleString("ja-JP")}`);
    console.log(`Agent: ${i.agent}`);
    if (i.repo) console.log(`Repo: ${i.repo}${i.branch ? ` (${i.branch})` : ""}`);
    console.log(`Content: ${i.content}`);
    if (i.detail) console.log(`Detail:\n${i.detail}`);
    if (i.rationale) console.log(`Rationale: ${i.rationale}`);
    if (tags) console.log(`Tags: ${tags}`);
    if (i.followUps?.length) {
      console.log("Follow-ups:");
      for (const f of i.followUps)
        console.log(`  ${f.resolved ? "[x]" : "[ ]"} ${f.content}`);
    }
    if (i.relationsAsSource?.length) {
      console.log("Related:");
      for (const r of i.relationsAsSource)
        console.log(`  -> #${r.target.id} (${r.type}) ${r.target.content.slice(0, 60)}`);
    }
  });

program
  .command("search <query>")
  .description("Search insights")
  .option("-T, --type <type>", "Filter by type")
  .action(async (query, opts) => {
    const params = new URLSearchParams({ q: query });
    if (opts.type) params.set("type", opts.type);

    const insights = await api(`/api/search?${params}`);
    if (!insights.length) {
      console.log("No results found.");
      return;
    }
    for (const i of insights) {
      const date = new Date(i.createdAt).toLocaleString("ja-JP");
      console.log(`#${i.id} [${i.type}] ${date} (${i.agent})`);
      console.log(`  ${i.content}`);
      console.log();
    }
  });

program.parse();
