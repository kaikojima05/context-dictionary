import { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db/client.js";

const createEntrySchema = z.object({
  agent: z.string().max(50),
  sessionId: z.string().max(100).optional(),
  summary: z.string().min(1),
  learnings: z.array(z.string()).optional(),
  decisions: z
    .array(z.object({ decision: z.string(), rationale: z.string() }))
    .optional(),
  context: z.record(z.unknown()).optional(),
  mood: z.string().max(20).optional(),
  tags: z.array(z.string()).optional(),
  followUps: z.array(z.string()).optional(),
});

const updateEntrySchema = createEntrySchema.partial();

export default async function entriesRoutes(app: FastifyInstance) {
  // Create entry
  app.post("/api/entries", async (request, reply) => {
    const body = createEntrySchema.parse(request.body);
    const { tags, followUps, ...data } = body;

    const entry = await prisma.entry.create({
      data: {
        ...data,
        tags: tags?.length
          ? {
              create: await Promise.all(
                tags.map(async (name) => {
                  const tag = await prisma.tag.upsert({
                    where: { name },
                    update: {},
                    create: { name },
                  });
                  return { tagId: tag.id };
                })
              ),
            }
          : undefined,
        followUps: followUps?.length
          ? { create: followUps.map((content) => ({ content })) }
          : undefined,
      },
      include: { tags: { include: { tag: true } }, followUps: true },
    });

    reply.status(201).send(entry);
  });

  // List entries
  app.get("/api/entries", async (request) => {
    const { agent, tag, from, to, q, limit, offset } = request.query as Record<
      string,
      string | undefined
    >;

    const entries = await prisma.entry.findMany({
      where: {
        ...(agent && { agent }),
        ...(tag && { tags: { some: { tag: { name: tag } } } }),
        ...(from && { createdAt: { gte: new Date(from) } }),
        ...(to && { createdAt: { lte: new Date(to) } }),
        ...(q && { summary: { contains: q } }),
      },
      include: { tags: { include: { tag: true } }, followUps: true },
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit) : 20,
      skip: offset ? parseInt(offset) : 0,
    });

    return entries;
  });

  // Get single entry
  app.get("/api/entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await prisma.entry.findUnique({
      where: { id: parseInt(id) },
      include: { tags: { include: { tag: true } }, followUps: true },
    });
    if (!entry) return reply.status(404).send({ error: "Entry not found" });
    return entry;
  });

  // Update entry
  app.patch("/api/entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateEntrySchema.parse(request.body);
    const { tags, followUps, ...data } = body;

    if (tags) {
      await prisma.entryTag.deleteMany({ where: { entryId: parseInt(id) } });
    }

    const entry = await prisma.entry.update({
      where: { id: parseInt(id) },
      data: {
        ...data,
        tags: tags?.length
          ? {
              create: await Promise.all(
                tags.map(async (name) => {
                  const tag = await prisma.tag.upsert({
                    where: { name },
                    update: {},
                    create: { name },
                  });
                  return { tagId: tag.id };
                })
              ),
            }
          : undefined,
      },
      include: { tags: { include: { tag: true } }, followUps: true },
    });

    return entry;
  });

  // Add follow-up
  app.post("/api/entries/:id/follow-ups", async (request) => {
    const { id } = request.params as { id: string };
    const { content } = z
      .object({ content: z.string().min(1) })
      .parse(request.body);

    const followUp = await prisma.followUp.create({
      data: { entryId: parseInt(id), content },
    });
    return followUp;
  });

  // Resolve follow-up
  app.patch("/api/follow-ups/:id", async (request) => {
    const { id } = request.params as { id: string };
    const { resolved } = z
      .object({ resolved: z.boolean() })
      .parse(request.body);

    const followUp = await prisma.followUp.update({
      where: { id: parseInt(id) },
      data: { resolved },
    });
    return followUp;
  });
}
