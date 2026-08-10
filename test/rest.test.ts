import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { insightFixture, MemoryContextService } from "./support.js";

describe("REST regression", () => {
  it("keeps create, list, get, update, search, and follow-up routes working through the service", async () => {
    const service = new MemoryContextService([insightFixture({ content: "existing MCP" })]);
    const app = buildApp({ logger: false, service });

    const created = await app.inject({
      method: "POST",
      url: "/api/insights",
      payload: { type: "solution", content: "new insight", agent: "claude", tags: ["mcp"] },
    });
    assert.equal(created.statusCode, 201);
    const createdBody = created.json();
    assert.equal(createdBody.content, "new insight");

    const listed = await app.inject({ method: "GET", url: "/api/insights?limit=10" });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().length, 2);

    const fetched = await app.inject({ method: "GET", url: `/api/insights/${createdBody.id}` });
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.json().id, createdBody.id);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/insights/${createdBody.id}`,
      payload: { detail: "kept over REST" },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().detail, "kept over REST");

    const followUp = await app.inject({
      method: "POST",
      url: `/api/insights/${createdBody.id}/follow-ups`,
      payload: { content: "verify" },
    });
    assert.equal(followUp.statusCode, 200);

    const resolved = await app.inject({
      method: "PATCH",
      url: `/api/follow-ups/${followUp.json().id}`,
      payload: { resolved: true },
    });
    assert.equal(resolved.statusCode, 200);
    assert.equal(resolved.json().resolved, true);

    const searched = await app.inject({ method: "GET", url: "/api/search?q=MCP" });
    assert.equal(searched.statusCode, 200);
    assert.equal(searched.json().length, 2);

    await app.close();
  });

  it("preserves 400 for missing search query and 404 for a missing insight", async () => {
    const app = buildApp({ logger: false, service: new MemoryContextService([]) });
    assert.equal((await app.inject({ method: "GET", url: "/api/search" })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: "/api/insights/999" })).statusCode, 404);
    await app.close();
  });
});
