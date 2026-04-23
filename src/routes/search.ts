import { FastifyInstance } from "fastify";
import prisma from "../db/client.js";

export default async function searchRoutes(app: FastifyInstance) {
  app.get("/api/search", async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q) return reply.status(400).send({ error: "Query parameter 'q' is required" });

    const entries = await prisma.entry.findMany({
      where: {
        summary: { search: q },
      },
      include: { tags: { include: { tag: true } }, followUps: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return entries;
  });
}
