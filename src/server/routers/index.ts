import { router } from "@/lib/trpc/init";
import { projectsRouter } from "./projects";
import { deploymentsRouter } from "./deployments";
import { nodesRouter } from "./nodes";
import { settingsRouter } from "./settings";

export const appRouter = router({
  projects: projectsRouter,
  deployments: deploymentsRouter,
  nodes: nodesRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
