import {
  ContextServiceApi,
  CreateInsightInput,
  DomainError,
  FollowUpResult,
  InsightRecord,
  ListInsightFilters,
  SearchInput,
  SearchResult,
  toInsightView,
  UpdateInsightInput,
  UpdateResult,
} from "../src/services/context-service.js";

export function insightFixture(overrides: Partial<InsightRecord> = {}): InsightRecord {
  const now = new Date("2026-08-10T00:00:00.000Z");
  return {
    id: 1,
    type: "discovery",
    content: "context dictionary insight",
    detail: null,
    rationale: null,
    agent: "test",
    repo: "sample/repo",
    branch: "main",
    sessionId: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    tags: [],
    followUps: [],
    relationsAsSource: [],
    relationsAsTarget: [],
    ...overrides,
  };
}

export class MemoryContextService implements ContextServiceApi {
  insights: InsightRecord[];
  nextInsightId: number;
  nextFollowUpId = 1;

  constructor(insights: InsightRecord[] = []) {
    this.insights = insights;
    this.nextInsightId = Math.max(0, ...insights.map(({ id }) => id)) + 1;
  }

  async createInsight(input: CreateInsightInput) {
    const insight = insightFixture({
      id: this.nextInsightId++,
      type: input.type,
      content: input.content,
      detail: input.detail ?? null,
      rationale: input.rationale ?? null,
      agent: input.agent,
      repo: input.repo ?? null,
      branch: input.branch ?? null,
      sessionId: input.sessionId ?? null,
      tags: (input.tags ?? []).map((name, index) => ({
        insightId: this.nextInsightId - 1,
        tagId: index + 1,
        tag: { id: index + 1, name },
      })),
    });
    this.insights.push(insight);
    return insight;
  }

  async createInsights(inputs: CreateInsightInput[]) {
    return Promise.all(inputs.map((input) => this.createInsight(input)));
  }

  async listInsights(_filters: ListInsightFilters) {
    return this.insights;
  }

  async legacySearch(_query: string, _type?: string, _agent?: string) {
    return this.insights;
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const matches = this.insights
      .filter(({ content }) => content.includes(input.query))
      .slice(0, input.limit ?? 5)
      .map(toInsightView);
    return {
      insights: matches,
      stages: [{ stage: 1, query: input.query, ...(input.repo ? { repo: input.repo } : {}), ...(input.type ? { type: input.type } : {}), resultCount: matches.length }],
    };
  }

  async getInsight(id: number) {
    const insight = this.insights.find((candidate) => candidate.id === id);
    if (!insight) throw new DomainError("NOT_FOUND", `Insight ${id} not found`);
    return insight;
  }

  async updateInsight(id: number, input: UpdateInsightInput, expectedVersion?: number): Promise<UpdateResult> {
    const insight = await this.getInsight(id);
    if (expectedVersion !== undefined && insight.version !== expectedVersion) {
      return { operation: "conflict", id, version: insight.version };
    }
    if (input.type !== undefined) insight.type = input.type;
    if (input.content !== undefined) insight.content = input.content;
    if (input.detail !== undefined) insight.detail = input.detail;
    if (input.rationale !== undefined) insight.rationale = input.rationale;
    if (input.repo !== undefined) insight.repo = input.repo;
    if (input.branch !== undefined) insight.branch = input.branch;
    if (input.tags !== undefined) {
      insight.tags = input.tags.map((name, index) => ({
        insightId: insight.id,
        tagId: index + 1,
        tag: { id: index + 1, name },
      }));
    }
    insight.version += 1;
    insight.updatedAt = new Date(insight.updatedAt.getTime() + 1);
    return { operation: "updated", insight };
  }

  async addFollowUp(insightId: number, content: string): Promise<FollowUpResult> {
    const insight = await this.getInsight(insightId);
    const now = new Date("2026-08-10T01:00:00.000Z");
    const followUp = {
      id: this.nextFollowUpId++,
      insightId,
      content,
      resolved: false,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    insight.followUps.push(followUp);
    return followUp;
  }

  async setFollowUpResolved(followUpId: number, resolved: boolean): Promise<FollowUpResult> {
    for (const insight of this.insights) {
      const followUp = insight.followUps.find(({ id }) => id === followUpId);
      if (!followUp) continue;
      followUp.resolved = resolved;
      followUp.updatedAt = new Date(followUp.updatedAt.getTime() + 1);
      followUp.resolvedAt = resolved ? followUp.updatedAt : null;
      return followUp;
    }
    throw new DomainError("NOT_FOUND", `Follow-up ${followUpId} not found`);
  }
}
