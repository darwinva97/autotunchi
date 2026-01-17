import { z } from "zod";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";

export const deploymentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const deployments = await ctx.db.deployment.findMany({
        where: { projectId: input.projectId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (deployments.length > input.limit) {
        const lastItem = deployments.pop();
        nextCursor = lastItem?.id;
      }

      return {
        items: deployments,
        nextCursor,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deployment = await ctx.db.deployment.findUnique({
        where: { id: input.id },
        include: { project: true },
      });

      if (!deployment || deployment.project.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return deployment;
    }),

  getLogs: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deployment = await ctx.db.deployment.findUnique({
        where: { id: input.id },
        include: { project: { select: { userId: true } } },
      });

      if (!deployment || deployment.project.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return {
        buildLogs: deployment.buildLogs,
        logs: deployment.logs,
        status: deployment.status,
        error: deployment.error,
      };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deployment = await ctx.db.deployment.findUnique({
        where: { id: input.id },
        include: { project: { select: { userId: true } } },
      });

      if (!deployment || deployment.project.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (deployment.status !== "pending" && deployment.status !== "building") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot cancel deployment in current state",
        });
      }

      return ctx.db.deployment.update({
        where: { id: input.id },
        data: {
          status: "failed",
          error: "Cancelled by user",
          finishedAt: new Date(),
        },
      });
    }),

  rollback: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deployment = await ctx.db.deployment.findUnique({
        where: { id: input.deploymentId },
        include: { project: true },
      });

      if (!deployment || deployment.project.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (deployment.status !== "live" || !deployment.imageTag) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only rollback to successful deployments with an image",
        });
      }

      // Create new deployment using the old image
      const newDeployment = await ctx.db.deployment.create({
        data: {
          projectId: deployment.projectId,
          commitSha: deployment.commitSha,
          commitMsg: `Rollback to ${deployment.commitSha.substring(0, 7)}`,
          status: "pending",
          imageTag: deployment.imageTag,
        },
      });

      // TODO: Queue the rollback deployment job
      // This would skip the build step and go straight to deploy

      return newDeployment;
    }),
});
