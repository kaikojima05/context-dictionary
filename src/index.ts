import "dotenv/config";
import { buildApp } from "./app.js";

const app = buildApp();
const port = Number.parseInt(process.env.PORT || "3210", 10);

app.listen({ port, host: "0.0.0.0" }, (error, address) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
  app.log.info(`context-dictionary server running at ${address}`);
});
