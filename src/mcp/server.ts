import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ContextServiceApi,
  DomainError,
  insightTypes,
  InsightView,
  relationTypes,
  toInsightView,
} from "../services/context-service.js";

const relationInputSchema = z.object({
  targetId: z.number().int().positive(),
  type: z.enum(relationTypes),
});

const followUpOutputSchema = z.object({
  id: z.number().int().positive(),
  content: z.string(),
  resolved: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().optional(),
});

const relationOutputSchema = z.object({
  id: z.number().int().positive(),
  direction: z.enum(["outgoing", "incoming"]),
  insightId: z.number().int().positive(),
  type: z.string(),
  content: z.string(),
});

const insightOutputSchema = z.object({
  id: z.number().int().positive(),
  type: z.string(),
  content: z.string(),
  detail: z.string().optional(),
  rationale: z.string().optional(),
  agent: z.string(),
  repo: z.string().optional(),
  branch: z.string().optional(),
  sessionId: z.string().optional(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  followUps: z.array(followUpOutputSchema),
  relations: z.array(relationOutputSchema),
});

const searchInputSchema = z.object({
  query: z.string().trim().min(1),
  fallbackQuery: z.string().trim().min(1).optional(),
  repo: z.string().trim().min(1).max(200).optional(),
  type: z.enum(insightTypes).optional(),
  limit: z.number().int().positive().max(5).default(5),
});

const upsertInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    expectedVersion: z.number().int().positive().optional(),
    type: z.enum(insightTypes).optional(),
    content: z.string().trim().min(1).optional(),
    detail: z.string().optional(),
    rationale: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).min(1).max(5).optional(),
    addTags: z.array(z.string().trim().min(1)).max(5).optional(),
    removeTags: z.array(z.string().trim().min(1)).max(5).optional(),
    repo: z.string().trim().min(1).max(200).optional(),
    branch: z.string().trim().min(1).max(200).optional(),
    relations: z.array(relationInputSchema).optional(),
    addRelations: z.array(relationInputSchema).optional(),
    removeRelations: z.array(relationInputSchema).optional(),
  })
  .superRefine((input, context) => {
    if (input.id === undefined) {
      if (!input.type) context.addIssue({ code: "custom", path: ["type"], message: "type is required for create" });
      if (!input.content) context.addIssue({ code: "custom", path: ["content"], message: "content is required for create" });
      if (!input.tags) context.addIssue({ code: "custom", path: ["tags"], message: "tags are required for create" });
    } else if (input.expectedVersion === undefined) {
      context.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "expectedVersion is required for update",
      });
    }
    if (input.type === "decision" && !input.rationale) {
      context.addIssue({ code: "custom", path: ["rationale"], message: "rationale is required for decision" });
    }
  });

const followUpInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), insightId: z.number().int().positive(), content: z.string().trim().min(1) }),
  z.object({ action: z.literal("resolve"), followUpId: z.number().int().positive() }),
  z.object({ action: z.literal("reopen"), followUpId: z.number().int().positive() }),
]);

type ToolError = { content: Array<{ type: "text"; text: string }>; isError: true };

function errorResult(error: unknown): ToolError {
  const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [{ type: "text", text: JSON.stringify({ code, message }) }],
    isError: true,
  };
}

function successResult<T extends Record<string, unknown>>(structuredContent: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function searchView(insight: InsightView): InsightView {
  return { ...insight, followUps: insight.followUps.filter((followUp) => !followUp.resolved) };
}

export function createContextMcpServer(
  service: ContextServiceApi,
  options: { agent?: string } = {},
) {
  const server = new McpServer({ name: "context-dictionary", version: "0.2.0" });
  const agent = options.agent ?? process.env.CONTEXT_AGENT ?? "mcp";

  server.registerTool(
    "search",
    {
      description: "Search insights with deterministic staged fallback, de-duplication, and ranking.",
      inputSchema: searchInputSchema,
      outputSchema: z.object({
        insights: z.array(insightOutputSchema),
        stages: z.array(
          z.object({
            stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            query: z.string(),
            repo: z.string().optional(),
            type: z.enum(insightTypes).optional(),
            resultCount: z.number().int().nonnegative(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const result = await service.search(input);
        return successResult({ ...result, insights: result.insights.map(searchView) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get",
    {
      description: "Get one explicitly identified insight with version and related records.",
      inputSchema: z.object({ id: z.number().int().positive() }),
      outputSchema: z.object({ insight: insightOutputSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        return successResult({ insight: toInsightView(await service.getInsight(id)) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "upsert",
    {
      description: "Create an insight or update only the explicit id with optimistic locking.",
      inputSchema: upsertInputSchema,
      outputSchema: z.object({
        operation: z.enum(["created", "updated", "conflict"]),
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      }),
      annotations: { readOnlyHint: false },
    },
    async (input) => {
      try {
        if (input.id === undefined) {
          const insight = await service.createInsight({
            type: input.type!,
            content: input.content!,
            detail: input.detail,
            rationale: input.rationale,
            agent,
            repo: input.repo,
            branch: input.branch,
            tags: input.tags!,
            relations: input.relations,
          });
          return successResult({ operation: "created", id: insight.id, version: insight.version });
        }

        const current = await service.getInsight(input.id);
        const nextType = input.type ?? current.type;
        const nextRationale = input.rationale ?? current.rationale;
        if (nextType === "decision" && !nextRationale) {
          return errorResult(new DomainError("VALIDATION_ERROR", "rationale is required for decision"));
        }

        const result = await service.updateInsight(
          input.id,
          {
            type: input.type,
            content: input.content,
            detail: input.detail,
            rationale: input.rationale,
            repo: input.repo,
            branch: input.branch,
            tags: input.tags,
            addTags: input.addTags,
            removeTags: input.removeTags,
            relations: input.relations,
            addRelations: input.addRelations,
            removeRelations: input.removeRelations,
          },
          input.expectedVersion,
        );
        if (result.operation === "conflict") return successResult(result);
        return successResult({
          operation: "updated",
          id: result.insight.id,
          version: result.insight.version,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "follow_up",
    {
      description: "Add, resolve, or reopen a follow-up through an explicit action.",
      inputSchema: followUpInputSchema,
      outputSchema: z.object({
        action: z.enum(["added", "resolved", "reopened"]),
        followUp: followUpOutputSchema.extend({ insightId: z.number().int().positive() }),
      }),
      annotations: { readOnlyHint: false },
    },
    async (input) => {
      try {
        const followUp =
          input.action === "add"
            ? await service.addFollowUp(input.insightId, input.content)
            : await service.setFollowUpResolved(input.followUpId, input.action === "resolve");
        return successResult({
          action: input.action === "add" ? "added" : input.action === "resolve" ? "resolved" : "reopened",
          followUp: {
            id: followUp.id,
            insightId: followUp.insightId,
            content: followUp.content,
            resolved: followUp.resolved,
            createdAt: followUp.createdAt.toISOString(),
            updatedAt: followUp.updatedAt.toISOString(),
            ...(followUp.resolvedAt ? { resolvedAt: followUp.resolvedAt.toISOString() } : {}),
          },
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
