import assert from "node:assert/strict";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createContextMcpServer } from "../src/mcp/server.js";
import { insightFixture, MemoryContextService } from "./support.js";

type Harness = { client: Client; close: () => Promise<void>; service: MemoryContextService };
const harnesses: Harness[] = [];

async function createHarness(insights = [insightFixture()]) {
  const service = new MemoryContextService(insights);
  const server = createContextMcpServer(service, { agent: "codex-test" });
  const client = new Client({ name: "context-dictionary-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const harness = {
    client,
    service,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map(({ close }) => close()));
});

describe("MCP protocol", () => {
  it("lists four typed tools with correct read-only annotations", async () => {
    const { client } = await createHarness();
    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map(({ name }) => name),
      ["search", "get", "upsert", "follow_up"],
    );
    assert.deepEqual(
      Object.fromEntries(result.tools.map(({ name, annotations }) => [name, annotations?.readOnlyHint])),
      {
        search: true,
        get: true,
        upsert: false,
        follow_up: false,
      },
    );
    for (const tool of result.tools) assert.ok(tool.outputSchema);
  });

  it("returns structured search output and only unresolved follow-ups", async () => {
    const insight = insightFixture({
      content: "MCP search",
      followUps: [
        { id: 1, insightId: 1, content: "open", resolved: false, createdAt: new Date(), updatedAt: new Date(), resolvedAt: null },
        { id: 2, insightId: 1, content: "done", resolved: true, createdAt: new Date(), updatedAt: new Date(), resolvedAt: new Date() },
      ],
    });
    const { client } = await createHarness([insight]);
    const result = await client.callTool({ name: "search", arguments: { query: "MCP" } });
    assert.equal(result.isError, undefined);
    const structured = result.structuredContent as { insights: Array<{ followUps: Array<{ content: string }> }>; stages: unknown[] };
    assert.deepEqual(structured.insights[0].followUps.map(({ content }) => content), ["open"]);
    assert.equal(structured.stages.length, 1);
  });

  it("returns distinguishable not-found errors and rejects invalid input", async () => {
    const { client } = await createHarness([]);
    const missing = await client.callTool({ name: "get", arguments: { id: 999 } });
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing.content), /NOT_FOUND/);

    const invalid = await client.callTool({ name: "search", arguments: { query: "" } });
    assert.equal(invalid.isError, true);
  });

  it("communicates over the real stdio entrypoint without stdout pollution", async () => {
    const transport = new StdioClientTransport({
      command: resolve("node_modules/.bin/tsx"),
      args: ["src/mcp/stdio.ts"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);
    const result = await client.listTools();
    assert.equal(result.tools.length, 4);
    await client.close();
  });
});

describe("upsert", () => {
  it("creates every insight type and requires rationale for decisions", async () => {
    const { client, service } = await createHarness([]);
    for (const type of ["discovery", "decision", "solution", "issue", "caveat"] as const) {
      const result = await client.callTool({
        name: "upsert",
        arguments: {
          type,
          content: `${type} content`,
          tags: [type],
          ...(type === "decision" ? { rationale: "because" } : {}),
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal((result.structuredContent as { operation: string }).operation, "created");
    }
    assert.equal(service.insights.length, 5);
    assert.ok(service.insights.every(({ agent }) => agent === "codex-test"));

    const invalidDecision = await client.callTool({
      name: "upsert",
      arguments: { type: "decision", content: "missing rationale", tags: ["decision"] },
    });
    assert.equal(invalidDecision.isError, true);
  });

  it("requires explicit id/version, preserves omitted fields, and reports conflicts without mutation", async () => {
    const original = insightFixture({ content: "before", detail: "keep", version: 3 });
    const { client, service } = await createHarness([original]);

    const noVersion = await client.callTool({
      name: "upsert",
      arguments: { id: 1, content: "forbidden" },
    });
    assert.equal(noVersion.isError, true);

    const updated = await client.callTool({
      name: "upsert",
      arguments: { id: 1, expectedVersion: 3, content: "after" },
    });
    assert.deepEqual(updated.structuredContent, { operation: "updated", id: 1, version: 4 });
    assert.equal(service.insights[0].detail, "keep");

    const conflict = await client.callTool({
      name: "upsert",
      arguments: { id: 1, expectedVersion: 3, content: "stale write" },
    });
    assert.deepEqual(conflict.structuredContent, { operation: "conflict", id: 1, version: 4 });
    assert.equal(service.insights[0].content, "after");

    const missing = await client.callTool({
      name: "upsert",
      arguments: { id: 999, expectedVersion: 1, content: "missing" },
    });
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing.content), /NOT_FOUND/);
  });

  it("enforces the five-tag limit", async () => {
    const { client } = await createHarness([]);
    const result = await client.callTool({
      name: "upsert",
      arguments: { type: "issue", content: "too many", tags: ["a", "b", "c", "d", "e", "f"] },
    });
    assert.equal(result.isError, true);
  });
});

describe("follow_up", () => {
  it("adds, resolves, and reopens only explicitly identified follow-ups", async () => {
    const { client } = await createHarness();
    const added = await client.callTool({
      name: "follow_up",
      arguments: { action: "add", insightId: 1, content: "verify clients" },
    });
    const id = (added.structuredContent as { followUp: { id: number } }).followUp.id;

    const resolved = await client.callTool({
      name: "follow_up",
      arguments: { action: "resolve", followUpId: id },
    });
    assert.equal((resolved.structuredContent as { followUp: { resolved: boolean } }).followUp.resolved, true);

    const reopened = await client.callTool({
      name: "follow_up",
      arguments: { action: "reopen", followUpId: id },
    });
    assert.equal((reopened.structuredContent as { followUp: { resolved: boolean } }).followUp.resolved, false);
  });

  it("reports missing insights and follow-ups", async () => {
    const { client } = await createHarness([]);
    const missingInsight = await client.callTool({
      name: "follow_up",
      arguments: { action: "add", insightId: 999, content: "missing" },
    });
    assert.equal(missingInsight.isError, true);

    const missingFollowUp = await client.callTool({
      name: "follow_up",
      arguments: { action: "resolve", followUpId: 999 },
    });
    assert.equal(missingFollowUp.isError, true);
  });
});
