import { FastifyInstance } from "fastify";
import prisma from "../db/client.js";

export default async function searchRoutes(app: FastifyInstance) {
  app.get("/api/search", async (request, reply) => {
    const { q, type, agent } = request.query as Record<string, string | undefined>;
    if (!q) return reply.status(400).send({ error: "Query parameter 'q' is required" });

    return prisma.insight.findMany({
      where: {
        content: { search: q },
        ...(type && { type }),
        ...(agent && { agent }),
      },
      include: {
        tags: { include: { tag: true } },
        followUps: true,
        relationsAsSource: { include: { target: true } },
        relationsAsTarget: { include: { source: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });
}
