import Fastify from "fastify";
import prisma from "./db/client.js";
import insightsRoutes from "./routes/entries.js";
import searchRoutes from "./routes/search.js";
import tagsRoutes from "./routes/tags.js";
import { ContextService, ContextServiceApi } from "./services/context-service.js";

export type AppOptions = {
  logger?: boolean;
  service?: ContextServiceApi;
};

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const service = options.service ?? new ContextService(prisma);

  app.register(insightsRoutes, { service });
  app.register(tagsRoutes);
  app.register(searchRoutes, { service });
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
