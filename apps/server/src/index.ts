import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const { app, ctx } = await buildApp(config);

ctx.scheduler.start();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.port, host: config.host });
app.log.info(
  { dataDir: config.dataDir, publicUrl: config.publicUrl || "(not set)", email: ctx.email.enabled },
  `Fixit ${config.version} is running`,
);
