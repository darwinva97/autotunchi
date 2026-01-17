import { z } from "zod";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { deployments, projects } from "@/lib/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";

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
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id!)
        ),
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Build query conditions
      const conditions = [eq(deployments.projectId, input.projectId)];

      if (input.cursor) {
        const cursorDeployment = await ctx.db.query.deployments.findFirst({
          where: eq(deployments.id, input.cursor),
        });
        if (cursorDeployment) {
          conditions.push(lt(deployments.createdAt, cursorDeployment.createdAt));
        }
      }

      const items = await ctx.db.query.deployments.findMany({
        where: and(...conditions),
        limit: input.limit + 1,
        orderBy: [desc(deployments.createdAt)],
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const lastItem = items.pop();
        nextCursor = lastItem?.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deployment = await ctx.db.query.deployments.findFirst({
        where: eq(deployments.id, input.id),
        with: {
          project: true,
        },
      });

      if (!deployment || deployment.project.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return deployment;
    }),

  getLogs: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deployment = await ctx.db.query.deployments.findFirst({
        where: eq(deployments.id, input.id),
        with: {
          project: {
            columns: {
              userId: true,
            },
          },
        },
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
      const deployment = await ctx.db.query.deployments.findFirst({
        where: eq(deployments.id, input.id),
        with: {
          project: {
            columns: {
              userId: true,
            },
          },
        },
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

      const [updated] = await ctx.db
        .update(deployments)
        .set({
          status: "failed",
          error: "Cancelled by user",
          finishedAt: new Date(),
        })
        .where(eq(deployments.id, input.id))
        .returning();

      return updated;
    }),

  rollback: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deployment = await ctx.db.query.deployments.findFirst({
        where: eq(deployments.id, input.deploymentId),
        with: {
          project: true,
        },
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
      const [newDeployment] = await ctx.db
        .insert(deployments)
        .values({
          projectId: deployment.projectId,
          commitSha: deployment.commitSha,
          commitMsg: `Rollback to ${deployment.commitSha.substring(0, 7)}`,
          status: "pending",
          imageTag: deployment.imageTag,
        })
        .returning();

      // TODO: Queue the rollback deployment job
      // This would skip the build step and go straight to deploy

      return newDeployment;
    }),
});
