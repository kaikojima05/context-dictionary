import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

export const insightTypes = [
  "discovery",
  "decision",
  "solution",
  "issue",
  "caveat",
] as const;

export const relationTypes = ["relates_to", "resolves", "supersedes"] as const;

const relationSchema = z.object({
  targetId: z.number().int().positive(),
  type: z.enum(relationTypes),
});

export const createInsightSchema = z.object({
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
  relations: z.array(relationSchema).optional(),
});

export const updateInsightSchema = createInsightSchema.partial().extend({
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
  addRelations: z.array(relationSchema).optional(),
  removeRelations: z.array(relationSchema).optional(),
});

export const insightWithAll = Prisma.validator<Prisma.InsightDefaultArgs>()({
  include: {
    tags: { include: { tag: true } },
    followUps: true,
    relationsAsSource: { include: { target: true } },
    relationsAsTarget: { include: { source: true } },
  },
});

export type CreateInsightInput = z.infer<typeof createInsightSchema>;
export type UpdateInsightInput = z.infer<typeof updateInsightSchema>;
export type InsightRecord = Prisma.InsightGetPayload<typeof insightWithAll>;
export type InsightType = (typeof insightTypes)[number];

export type InsightView = {
  id: number;
  type: string;
  content: string;
  detail?: string;
  rationale?: string;
  agent: string;
  repo?: string;
  branch?: string;
  sessionId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  followUps: Array<{
    id: number;
    content: string;
    resolved: boolean;
    createdAt: string;
    updatedAt: string;
    resolvedAt?: string;
  }>;
  relations: Array<{
    id: number;
    direction: "outgoing" | "incoming";
    insightId: number;
    type: string;
    content: string;
  }>;
};

export type SearchStage = {
  stage: 1 | 2 | 3;
  query: string;
  repo?: string;
  type?: InsightType;
  resultCount: number;
};

export type SearchResult = {
  insights: InsightView[];
  stages: SearchStage[];
};

export type ContextServiceApi = {
  createInsight(input: CreateInsightInput): Promise<InsightRecord>;
  createInsights(inputs: CreateInsightInput[]): Promise<InsightRecord[]>;
  listInsights(filters: ListInsightFilters): Promise<InsightRecord[]>;
  legacySearch(query: string, type?: string, agent?: string): Promise<InsightRecord[]>;
  search(input: SearchInput): Promise<SearchResult>;
  getInsight(id: number): Promise<InsightRecord>;
  updateInsight(id: number, input: UpdateInsightInput, expectedVersion?: number): Promise<UpdateResult>;
  addFollowUp(insightId: number, content: string): Promise<FollowUpResult>;
  setFollowUpResolved(followUpId: number, resolved: boolean): Promise<FollowUpResult>;
};

export type ListInsightFilters = {
  agent?: string;
  type?: string;
  tag?: string;
  repo?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type SearchInput = {
  query: string;
  fallbackQuery?: string;
  repo?: string;
  type?: InsightType;
  limit?: number;
};

export type UpdateResult =
  | { operation: "updated"; insight: InsightRecord }
  | { operation: "conflict"; id: number; version: number };

export type FollowUpResult = {
  id: number;
  insightId: number;
  content: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

export type DomainErrorCode = "NOT_FOUND" | "VALIDATION_ERROR";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

type TransactionClient = Prisma.TransactionClient;

function uniqueNames(names: string[]) {
  return [...new Set(names)];
}

async function tagIds(tx: TransactionClient, names: string[]) {
  return Promise.all(
    uniqueNames(names).map(async (name) => {
      const tag = await tx.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      return tag.id;
    }),
  );
}

async function addTags(tx: TransactionClient, insightId: number, names: string[]) {
  const ids = await tagIds(tx, names);
  if (ids.length === 0) return;
  await tx.insightTag.createMany({
    data: ids.map((tagId) => ({ insightId, tagId })),
    skipDuplicates: true,
  });
}

async function addRelations(
  tx: TransactionClient,
  sourceId: number,
  relations: Array<{ targetId: number; type: (typeof relationTypes)[number] }>,
) {
  if (relations.length === 0) return;
  await tx.insightRelation.createMany({
    data: relations.map(({ targetId, type }) => ({ sourceId, targetId, type })),
    skipDuplicates: true,
  });
}

function scalarUpdate(input: UpdateInsightInput) {
  return {
    type: input.type,
    content: input.content,
    detail: input.detail,
    rationale: input.rationale,
    agent: input.agent,
    repo: input.repo,
    branch: input.branch,
    sessionId: input.sessionId,
  };
}

function exactPhrase(content: string, query: string) {
  return content.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function asInsightType(value?: string) {
  return value as InsightType | undefined;
}

export function rankSearchResults(
  insights: InsightRecord[],
  input: Pick<SearchInput, "query" | "repo" | "type">,
) {
  return [...insights].sort((left, right) => {
    const leftRank = [
      exactPhrase(left.content, input.query),
      Boolean(input.repo && left.repo === input.repo),
      Boolean(input.type && left.type === input.type),
    ];
    const rightRank = [
      exactPhrase(right.content, input.query),
      Boolean(input.repo && right.repo === input.repo),
      Boolean(input.type && right.type === input.type),
    ];

    for (let index = 0; index < leftRank.length; index += 1) {
      if (leftRank[index] !== rightRank[index]) return leftRank[index] ? -1 : 1;
    }

    const updatedOrder = right.updatedAt.getTime() - left.updatedAt.getTime();
    return updatedOrder || right.id - left.id;
  });
}

export function toInsightView(insight: InsightRecord): InsightView {
  return {
    id: insight.id,
    type: insight.type,
    content: insight.content,
    ...(insight.detail ? { detail: insight.detail } : {}),
    ...(insight.rationale ? { rationale: insight.rationale } : {}),
    agent: insight.agent,
    ...(insight.repo ? { repo: insight.repo } : {}),
    ...(insight.branch ? { branch: insight.branch } : {}),
    ...(insight.sessionId ? { sessionId: insight.sessionId } : {}),
    version: insight.version,
    createdAt: insight.createdAt.toISOString(),
    updatedAt: insight.updatedAt.toISOString(),
    tags: insight.tags.map(({ tag }) => tag.name),
    followUps: insight.followUps.map((followUp) => ({
      id: followUp.id,
      content: followUp.content,
      resolved: followUp.resolved,
      createdAt: followUp.createdAt.toISOString(),
      updatedAt: followUp.updatedAt.toISOString(),
      ...(followUp.resolvedAt ? { resolvedAt: followUp.resolvedAt.toISOString() } : {}),
    })),
    relations: [
      ...insight.relationsAsSource.map((relation) => ({
        id: relation.id,
        direction: "outgoing" as const,
        insightId: relation.targetId,
        type: relation.type,
        content: relation.target.content,
      })),
      ...insight.relationsAsTarget.map((relation) => ({
        id: relation.id,
        direction: "incoming" as const,
        insightId: relation.sourceId,
        type: relation.type,
        content: relation.source.content,
      })),
    ],
  };
}

export class ContextService implements ContextServiceApi {
  constructor(private readonly prisma: PrismaClient) {}

  async createInsight(input: CreateInsightInput) {
    return this.prisma.$transaction(async (tx) => {
      const { tags = [], followUps = [], relations = [], ...data } = input;
      const insight = await tx.insight.create({ data });
      await addTags(tx, insight.id, tags);
      if (followUps.length > 0) {
        await tx.followUp.createMany({
          data: followUps.map((content) => ({ insightId: insight.id, content })),
        });
      }
      await addRelations(tx, insight.id, relations);
      return tx.insight.findUniqueOrThrow({ where: { id: insight.id }, ...insightWithAll });
    });
  }

  async createInsights(inputs: CreateInsightInput[]) {
    const results: InsightRecord[] = [];
    for (const input of inputs) results.push(await this.createInsight(input));
    return results;
  }

  async listInsights(filters: ListInsightFilters) {
    return this.prisma.insight.findMany({
      where: {
        ...(filters.agent && { agent: filters.agent }),
        ...(filters.type && { type: asInsightType(filters.type) }),
        ...(filters.repo && { repo: filters.repo }),
        ...(filters.tag && { tags: { some: { tag: { name: filters.tag } } } }),
        ...(filters.from && { createdAt: { gte: new Date(filters.from) } }),
        ...(filters.to && { createdAt: { lte: new Date(filters.to) } }),
        ...(filters.q && { content: { contains: filters.q } }),
      },
      ...insightWithAll,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 20,
      skip: filters.offset ?? 0,
    });
  }

  async legacySearch(query: string, type?: string, agent?: string) {
    return this.prisma.insight.findMany({
      where: {
        content: { search: query },
        ...(type && { type: asInsightType(type) }),
        ...(agent && { agent }),
      },
      ...insightWithAll,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const stages: SearchStage[] = [];
    const unique = new Map<number, InsightRecord>();
    const runStage = async (stage: 1 | 2 | 3, query: string, repo?: string, type?: InsightType) => {
      const found = await this.prisma.insight.findMany({
        where: {
          content: { contains: query },
          ...(repo && { repo }),
          ...(type && { type }),
        },
        ...insightWithAll,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 10,
      });
      stages.push({ stage, query, ...(repo ? { repo } : {}), ...(type ? { type } : {}), resultCount: found.length });
      for (const insight of found) unique.set(insight.id, insight);
    };

    await runStage(1, input.query, input.repo, input.type);
    if (unique.size < 3 && input.type) await runStage(2, input.query, input.repo);
    if (unique.size < 3 && input.fallbackQuery) await runStage(3, input.fallbackQuery);

    const limit = input.limit ?? 5;
    return {
      insights: rankSearchResults([...unique.values()], input).slice(0, limit).map(toInsightView),
      stages,
    };
  }

  async getInsight(id: number) {
    const insight = await this.prisma.insight.findUnique({ where: { id }, ...insightWithAll });
    if (!insight) throw new DomainError("NOT_FOUND", `Insight ${id} not found`);
    return insight;
  }

  async updateInsight(id: number, input: UpdateInsightInput, expectedVersion?: number): Promise<UpdateResult> {
    return this.prisma.$transaction(async (tx) => {
      if (expectedVersion !== undefined) {
        const claimed = await tx.insight.updateMany({
          where: { id, version: expectedVersion },
          data: { ...scalarUpdate(input), version: { increment: 1 } },
        });
        if (claimed.count === 0) {
          const current = await tx.insight.findUnique({ where: { id }, select: { version: true } });
          if (!current) throw new DomainError("NOT_FOUND", `Insight ${id} not found`);
          return { operation: "conflict", id, version: current.version };
        }
      } else {
        const existing = await tx.insight.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new DomainError("NOT_FOUND", `Insight ${id} not found`);
        await tx.insight.update({
          where: { id },
          data: { ...scalarUpdate(input), version: { increment: 1 } },
        });
      }

      if (input.tags !== undefined) {
        await tx.insightTag.deleteMany({ where: { insightId: id } });
        await addTags(tx, id, input.tags);
      } else {
        if (input.removeTags?.length) {
          await tx.insightTag.deleteMany({
            where: { insightId: id, tag: { name: { in: input.removeTags } } },
          });
        }
        if (input.addTags?.length) await addTags(tx, id, input.addTags);
      }

      if (input.relations !== undefined) {
        await tx.insightRelation.deleteMany({ where: { sourceId: id } });
        await addRelations(tx, id, input.relations);
      } else {
        for (const relation of input.removeRelations ?? []) {
          await tx.insightRelation.deleteMany({
            where: { sourceId: id, targetId: relation.targetId, type: relation.type },
          });
        }
        if (input.addRelations?.length) await addRelations(tx, id, input.addRelations);
      }

      const insight = await tx.insight.findUniqueOrThrow({ where: { id }, ...insightWithAll });
      return { operation: "updated", insight };
    });
  }

  async addFollowUp(insightId: number, content: string) {
    const insight = await this.prisma.insight.findUnique({ where: { id: insightId }, select: { id: true } });
    if (!insight) throw new DomainError("NOT_FOUND", `Insight ${insightId} not found`);
    return this.prisma.followUp.create({ data: { insightId, content } });
  }

  async setFollowUpResolved(followUpId: number, resolved: boolean) {
    const existing = await this.prisma.followUp.findUnique({ where: { id: followUpId }, select: { id: true } });
    if (!existing) throw new DomainError("NOT_FOUND", `Follow-up ${followUpId} not found`);
    return this.prisma.followUp.update({
      where: { id: followUpId },
      data: { resolved, resolvedAt: resolved ? new Date() : null },
    });
  }
}
