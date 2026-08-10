import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { ContextService, rankSearchResults } from "../src/services/context-service.js";
import { insightFixture } from "./support.js";

describe("ContextService.search", () => {
  it("stops after stage 1 when at least three unique results exist", async () => {
    const calls: unknown[] = [];
    const results = [1, 2, 3].map((id) => insightFixture({ id }));
    const prisma = {
      insight: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return results;
        },
      },
    } as unknown as PrismaClient;

    const result = await new ContextService(prisma).search({
      query: "context dictionary",
      repo: "sample/repo",
      type: "discovery",
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(result.stages.map(({ stage }) => stage), [1]);
    assert.deepEqual(result.insights.map(({ id }) => id), [3, 2, 1]);
  });

  it("relaxes type, then repo/query with explicit fallback and de-duplicates ids", async () => {
    const first = insightFixture({ id: 1 });
    const second = insightFixture({ id: 2, type: "solution" });
    const third = insightFixture({ id: 3, repo: "other/repo", content: "MCP Prisma" });
    const responses = [[first], [first, second], [second, third]];
    const calls: Array<{ where: unknown }> = [];
    const prisma = {
      insight: {
        findMany: async (args: { where: unknown }) => {
          calls.push(args);
          return responses.shift() ?? [];
        },
      },
    } as unknown as PrismaClient;

    const result = await new ContextService(prisma).search({
      query: "context dictionary",
      fallbackQuery: "MCP Prisma",
      repo: "sample/repo",
      type: "discovery",
    });

    assert.equal(calls.length, 3);
    assert.deepEqual(result.stages.map(({ stage }) => stage), [1, 2, 3]);
    assert.deepEqual(new Set(result.insights.map(({ id }) => id)).size, 3);
  });

  it("does not invent a fallback query and returns zero results", async () => {
    let calls = 0;
    const prisma = {
      insight: { findMany: async () => (calls += 1, []) },
    } as unknown as PrismaClient;
    const result = await new ContextService(prisma).search({ query: "absent" });
    assert.equal(calls, 1);
    assert.deepEqual(result.insights, []);
  });
});

describe("rankSearchResults", () => {
  it("uses phrase, repo, type, updatedAt, then id as deterministic tie breakers", () => {
    const old = new Date("2026-08-01T00:00:00.000Z");
    const recent = new Date("2026-08-02T00:00:00.000Z");
    const ranked = rankSearchResults(
      [
        insightFixture({ id: 1, content: "MCP migration", repo: "other", updatedAt: recent }),
        insightFixture({ id: 2, content: "MCP migration", repo: "repo", type: "solution", updatedAt: recent }),
        insightFixture({ id: 3, content: "MCP migration", repo: "repo", type: "discovery", updatedAt: old }),
        insightFixture({ id: 4, content: "MCP migration", repo: "repo", type: "discovery", updatedAt: recent }),
        insightFixture({ id: 5, content: "MCP migration", repo: "repo", type: "discovery", updatedAt: recent }),
        insightFixture({ id: 6, content: "migration only", repo: "repo", type: "discovery", updatedAt: recent }),
      ],
      { query: "MCP migration", repo: "repo", type: "discovery" },
    );
    assert.deepEqual(ranked.map(({ id }) => id), [5, 4, 3, 2, 1, 6]);
  });
});
