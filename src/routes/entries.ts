import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  ContextServiceApi,
  createInsightSchema,
  DomainError,
  updateInsightSchema,
} from "../services/context-service.js";

export type InsightsRouteOptions = { service: ContextServiceApi };

function sendDomainError(error: unknown, reply: FastifyReply) {
  if (error instanceof DomainError && error.code === "NOT_FOUND") {
    return reply.status(404).send({ error: error.message });
  }
  throw error;
}

export default async function insightsRoutes(app: FastifyInstance, options: InsightsRouteOptions) {
  const { service } = options;

  app.post("/api/insights", async (request, reply) => {
    const insight = await service.createInsight(createInsightSchema.parse(request.body));
    reply.status(201).send(insight);
  });

  app.post("/api/insights/bulk", async (request, reply) => {
    const body = z.array(createInsightSchema).parse(request.body);
    const insights = await service.createInsights(body);
    reply.status(201).send(insights);
  });

  app.get("/api/insights", async (request) => {
    const { agent, type, tag, repo, from, to, q, limit, offset } =
      request.query as Record<string, string | undefined>;
    return service.listInsights({
      agent,
      type,
      tag,
      repo,
      from,
      to,
      q,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
  });

  app.get("/api/insights/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await service.getInsight(Number.parseInt(id, 10));
    } catch (error) {
      return sendDomainError(error, reply);
    }
  });

  app.patch("/api/insights/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await service.updateInsight(
        Number.parseInt(id, 10),
        updateInsightSchema.parse(request.body),
      );
      if (result.operation === "conflict") {
        return reply.status(409).send(result);
      }
      return result.insight;
    } catch (error) {
      return sendDomainError(error, reply);
    }
  });

  app.post("/api/insights/:id/follow-ups", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { content } = z.object({ content: z.string().min(1) }).parse(request.body);
    try {
      return await service.addFollowUp(Number.parseInt(id, 10), content);
    } catch (error) {
      return sendDomainError(error, reply);
    }
  });

  app.patch("/api/follow-ups/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { resolved } = z.object({ resolved: z.boolean() }).parse(request.body);
    try {
      return await service.setFollowUpResolved(Number.parseInt(id, 10), resolved);
    } catch (error) {
      return sendDomainError(error, reply);
    }
  });
}
