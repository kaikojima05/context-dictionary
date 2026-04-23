import "dotenv/config";
import Fastify from "fastify";
import insightsRoutes from "./routes/entries.js";
import tagsRoutes from "./routes/tags.js";
import searchRoutes from "./routes/search.js";

const app = Fastify({ logger: true });
const port = parseInt(process.env.PORT || "3210");

app.register(insightsRoutes);
app.register(tagsRoutes);
app.register(searchRoutes);

app.get("/health", async () => ({ status: "ok" }));

app.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`context-dictionary server running at ${address}`);
});
