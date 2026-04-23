import { FastifyInstance } from "fastify";
import prisma from "../db/client.js";

export default async function tagsRoutes(app: FastifyInstance) {
  app.get("/api/tags", async () => {
    const tags = await prisma.tag.findMany({
      include: { _count: { select: { insights: true } } },
      orderBy: { name: "asc" },
    });

    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      count: t._count.insights,
    }));
  });
}
