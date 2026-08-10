import { FastifyInstance } from "fastify";
import { ContextServiceApi } from "../services/context-service.js";

export type SearchRouteOptions = { service: ContextServiceApi };

export default async function searchRoutes(app: FastifyInstance, options: SearchRouteOptions) {
  app.get("/api/search", async (request, reply) => {
    const { q, type, agent } = request.query as Record<string, string | undefined>;
    if (!q) return reply.status(400).send({ error: "Query parameter 'q' is required" });
    return options.service.legacySearch(q, type, agent);
  });
}
