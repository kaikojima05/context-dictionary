import { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db/client.js";

const insightTypes = ["discovery", "decision", "solution", "issue", "caveat"] as const;
const relationTypes = ["relates_to", "resolves", "supersedes"] as const;

const createInsightSchema = z.object({
  type: z.enum(insightTypes),
  content: z.string().min(1),
  detail: z.string().optional(),
  rationale: z.string().optional(),
  agent: z.string().max(50),
  repo: z.string().max(200).optional(),
  branch: z.string().max(200).optional(),
  sessionId: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  followUps: z.array(z.string()).optional(),
  relations: z
    .array(
      z.object({
        targetId: z.number(),
        type: z.enum(relationTypes),
      })
    )
    .optional(),
});

const updateInsightSchema = createInsightSchema.partial();

const includeAll = {
  tags: { include: { tag: true } },
  followUps: true,
  relationsAsSource: { include: { target: true } },
  relationsAsTarget: { include: { source: true } },
} as const;

async function upsertTags(names: string[]) {
  return Promise.all(
    names.map(async (name) => {
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      return { tagId: tag.id };
    })
  );
}

export default async function insightsRoutes(app: FastifyInstance) {
  // Create insight
  app.post("/api/insights", async (request, reply) => {
    const body = createInsightSchema.parse(request.body);
    const { tags, followUps, relations, ...data } = body;

    const insight = await prisma.insight.create({
      data: {
        ...data,
        tags: tags?.length ? { create: await upsertTags(tags) } : undefined,
        followUps: followUps?.length
          ? { create: followUps.map((content) => ({ content })) }
          : undefined,
        relationsAsSource: relations?.length
          ? {
              create: relations.map((r) => ({
                targetId: r.targetId,
                type: r.type,
              })),
            }
          : undefined,
      },
      include: includeAll,
    });

    reply.status(201).send(insight);
  });

  // Bulk create insights
  app.post("/api/insights/bulk", async (request, reply) => {
    const body = z.array(createInsightSchema).parse(request.body);

    const results = [];
    for (const item of body) {
      const { tags, followUps, relations, ...data } = item;
      const insight = await prisma.insight.create({
        data: {
          ...data,
          tags: tags?.length ? { create: await upsertTags(tags) } : undefined,
          followUps: followUps?.length
            ? { create: followUps.map((content) => ({ content })) }
            : undefined,
          relationsAsSource: relations?.length
            ? {
                create: relations.map((r) => ({
                  targetId: r.targetId,
                  type: r.type,
                })),
              }
            : undefined,
        },
        include: includeAll,
      });
      results.push(insight);
    }

    reply.status(201).send(results);
  });

  // List insights
  app.get("/api/insights", async (request) => {
    const { agent, type, tag, repo, from, to, q, limit, offset } =
      request.query as Record<string, string | undefined>;

    return prisma.insight.findMany({
      where: {
        ...(agent && { agent }),
        ...(type && { type }),
        ...(repo && { repo }),
        ...(tag && { tags: { some: { tag: { name: tag } } } }),
        ...(from && { createdAt: { gte: new Date(from) } }),
        ...(to && { createdAt: { lte: new Date(to) } }),
        ...(q && { content: { contains: q } }),
      },
      include: includeAll,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit) : 20,
      skip: offset ? parseInt(offset) : 0,
    });
  });

  // Get single insight
  app.get("/api/insights/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const insight = await prisma.insight.findUnique({
      where: { id: parseInt(id) },
      include: includeAll,
    });
    if (!insight) return reply.status(404).send({ error: "Insight not found" });
    return insight;
  });

  // Update insight
  app.patch("/api/insights/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = updateInsightSchema.parse(request.body);
    const { tags, followUps, relations, ...data } = body;

    const numId = parseInt(id);

    if (tags) {
      await prisma.insightTag.deleteMany({ where: { insightId: numId } });
    }
    if (relations) {
      await prisma.insightRelation.deleteMany({ where: { sourceId: numId } });
    }

    return prisma.insight.update({
      where: { id: numId },
      data: {
        ...data,
        tags: tags?.length ? { create: await upsertTags(tags) } : undefined,
        relationsAsSource: relations?.length
          ? {
              create: relations.map((r) => ({
                targetId: r.targetId,
                type: r.type,
              })),
            }
          : undefined,
      },
      include: includeAll,
    });
  });

  // Add follow-up
  app.post("/api/insights/:id/follow-ups", async (request) => {
    const { id } = request.params as { id: string };
    const { content } = z
      .object({ content: z.string().min(1) })
      .parse(request.body);

    return prisma.followUp.create({
      data: { insightId: parseInt(id), content },
    });
  });

  // Resolve follow-up
  app.patch("/api/follow-ups/:id", async (request) => {
    const { id } = request.params as { id: string };
    const { resolved } = z
      .object({ resolved: z.boolean() })
      .parse(request.body);

    return prisma.followUp.update({
      where: { id: parseInt(id) },
      data: { resolved },
    });
  });
}
