import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { ContextService } from "../src/services/context-service.js";

const databaseUrl = process.env.CONTEXT_TEST_DATABASE_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";

if (!databaseUrl) {
  it.skip("database integration requires CONTEXT_TEST_DATABASE_URL", () => {});
} else if (databaseName !== "context_dictionary_mcp_test") {
  throw new Error(`Refusing database integration test for unsafe database: ${databaseName}`);
} else {
  describe("database integration", () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const service = new ContextService(prisma);

    async function clean() {
      await prisma.insightRelation.deleteMany();
      await prisma.followUp.deleteMany();
      await prisma.insightTag.deleteMany();
      await prisma.insight.deleteMany();
      await prisma.tag.deleteMany();
    }

    before(clean);
    after(async () => {
      await clean();
      await prisma.$disconnect();
    });

    it("creates, updates with a matching version, preserves arrays, and rejects stale writes", async () => {
      const firstTarget = await service.createInsight({
        type: "discovery",
        content: "First relation target",
        agent: "database-test",
        tags: ["relation"],
      });
      const secondTarget = await service.createInsight({
        type: "discovery",
        content: "Second relation target",
        agent: "database-test",
        tags: ["relation"],
      });
      const created = await service.createInsight({
        type: "solution",
        content: "Prisma optimistic locking",
        detail: "original detail",
        agent: "database-test",
        repo: "sample/repo",
        tags: ["prisma", "locking"],
        relations: [{ targetId: firstTarget.id, type: "relates_to" }],
      });
      assert.equal(created.version, 1);

      const updated = await service.updateInsight(
        created.id,
        {
          content: "Prisma version locking",
          addTags: ["mcp"],
          addRelations: [{ targetId: secondTarget.id, type: "resolves" }],
        },
        created.version,
      );
      assert.equal(updated.operation, "updated");
      if (updated.operation !== "updated") return;
      assert.equal(updated.insight.version, 2);
      assert.equal(updated.insight.detail, "original detail");
      assert.deepEqual(updated.insight.tags.map(({ tag }) => tag.name).sort(), ["locking", "mcp", "prisma"]);
      assert.deepEqual(
        updated.insight.relationsAsSource.map(({ targetId, type }) => `${targetId}:${type}`).sort(),
        [`${firstTarget.id}:relates_to`, `${secondTarget.id}:resolves`],
      );

      const conflict = await service.updateInsight(
        created.id,
        { content: "stale write", tags: ["destroyed"], relations: [] },
        1,
      );
      assert.deepEqual(conflict, { operation: "conflict", id: created.id, version: 2 });
      const unchanged = await service.getInsight(created.id);
      assert.equal(unchanged.content, "Prisma version locking");
      assert.deepEqual(unchanged.tags.map(({ tag }) => tag.name).sort(), ["locking", "mcp", "prisma"]);
      assert.equal(unchanged.relationsAsSource.length, 2);
    });

    it("records follow-up resolve and reopen transitions", async () => {
      const insight = await service.createInsight({
        type: "issue",
        content: "Follow-up transition",
        agent: "database-test",
        tags: ["follow-up"],
      });
      const added = await service.addFollowUp(insight.id, "verify transition");
      assert.equal(added.resolved, false);
      assert.equal(added.resolvedAt, null);

      const resolved = await service.setFollowUpResolved(added.id, true);
      assert.equal(resolved.resolved, true);
      assert.ok(resolved.resolvedAt);

      const reopened = await service.setFollowUpResolved(added.id, false);
      assert.equal(reopened.resolved, false);
      assert.equal(reopened.resolvedAt, null);
    });
  });
}
