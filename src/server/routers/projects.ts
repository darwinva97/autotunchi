import { z } from "zod";
import { randomBytes } from "crypto";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { getGitHubAccessToken } from "@/lib/auth";
import {
  listRepositories,
  getBranches,
  getLatestCommit,
  createWebhook,
  deleteWebhook,
} from "@/lib/github/client";
import { TRPCError } from "@trpc/server";
import { projects, deployments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userProjects = await ctx.db.query.projects.findMany({
      where: eq(projects.userId, ctx.user.id!),
      with: {
        deployments: {
          limit: 1,
          orderBy: [desc(deployments.createdAt)],
        },
      },
      orderBy: [desc(projects.updatedAt)],
    });

    return userProjects;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id!)),
        with: {
          deployments: {
            limit: 10,
            orderBy: [desc(deployments.createdAt)],
          },
        },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return project;
    }),

  getRepositories: protectedProcedure.query(async ({ ctx }) => {
    const token = await getGitHubAccessToken(ctx.user.id!);
    if (!token) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "GitHub account not connected",
      });
    }

    return listRepositories(token);
  }),

  getBranches: protectedProcedure
    .input(z.object({ repoFullName: z.string() }))
    .query(async ({ ctx, input }) => {
      const token = await getGitHubAccessToken(ctx.user.id!);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "GitHub account not connected",
        });
      }

      const [owner, repo] = input.repoFullName.split("/");
      return getBranches(token, owner, repo);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        repoFullName: z.string(),
        branch: z.string().default("main"),
        port: z.number().int().min(1).max(65535).default(3000),
        buildCommand: z.string().optional(),
        startCommand: z.string().optional(),
        nodeAffinity: z.string().optional(),
        cpuLimit: z.string().default("500m"),
        cpuRequest: z.string().default("100m"),
        memoryLimit: z.string().default("512Mi"),
        memoryRequest: z.string().default("128Mi"),
        replicas: z.number().int().min(1).max(10).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getGitHubAccessToken(ctx.user.id!);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "GitHub account not connected",
        });
      }

      // Generate unique slug
      let slug = generateSlug(input.name);
      let suffix = 0;
      while (
        await ctx.db.query.projects.findFirst({
          where: eq(projects.slug, slug),
        })
      ) {
        suffix++;
        slug = `${generateSlug(input.name)}-${suffix}`;
      }

      // Generate subdomain
      let subdomain = slug;
      while (
        await ctx.db.query.projects.findFirst({
          where: eq(projects.subdomain, subdomain),
        })
      ) {
        subdomain = `${slug}-${randomBytes(4).toString("hex")}`;
      }

      // Generate webhook secret
      const webhookSecret = randomBytes(32).toString("hex");

      // Create the project
      const [project] = await ctx.db
        .insert(projects)
        .values({
          name: input.name,
          slug,
          subdomain,
          repoFullName: input.repoFullName,
          branch: input.branch,
          port: input.port,
          buildCommand: input.buildCommand,
          startCommand: input.startCommand,
          nodeAffinity: input.nodeAffinity,
          cpuLimit: input.cpuLimit,
          cpuRequest: input.cpuRequest,
          memoryLimit: input.memoryLimit,
          memoryRequest: input.memoryRequest,
          replicas: input.replicas,
          webhookSecret,
          userId: ctx.user.id!,
        })
        .returning();

      // Create GitHub webhook
      const [owner, repo] = input.repoFullName.split("/");
      const webhookUrl = `${process.env.AUTH_URL}/api/webhooks/github`;

      try {
        const webhookId = await createWebhook(
          token,
          owner,
          repo,
          webhookUrl,
          webhookSecret
        );

        await ctx.db
          .update(projects)
          .set({ webhookId: webhookId.toString() })
          .where(eq(projects.id, project.id));
      } catch (error) {
        console.error("Failed to create webhook:", error);
        // Don't fail project creation, webhook can be added later
      }

      return project;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        branch: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        buildCommand: z.string().optional(),
        startCommand: z.string().optional(),
        nodeAffinity: z.string().nullable().optional(),
        cpuLimit: z.string().optional(),
        cpuRequest: z.string().optional(),
        memoryLimit: z.string().optional(),
        memoryRequest: z.string().optional(),
        replicas: z.number().int().min(1).max(10).optional(),
        customDomain: z.string().nullable().optional(),
        envVars: z.record(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, ctx.user.id!)),
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const [updated] = await ctx.db
        .update(projects)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id!)),
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Delete webhook from GitHub
      if (project.webhookId) {
        const token = await getGitHubAccessToken(ctx.user.id!);
        if (token) {
          const [owner, repo] = project.repoFullName.split("/");
          try {
            await deleteWebhook(token, owner, repo, parseInt(project.webhookId));
          } catch (error) {
            console.error("Failed to delete webhook:", error);
          }
        }
      }

      // Delete project (cascades to deployments due to FK constraint)
      await ctx.db.delete(projects).where(eq(projects.id, input.id));

      return { success: true };
    }),

  triggerDeploy: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id!)
        ),
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const token = await getGitHubAccessToken(ctx.user.id!);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "GitHub account not connected",
        });
      }

      const [owner, repo] = project.repoFullName.split("/");
      const commit = await getLatestCommit(token, owner, repo, project.branch);

      // Create deployment record
      const [deployment] = await ctx.db
        .insert(deployments)
        .values({
          projectId: project.id,
          commitSha: commit.sha,
          commitMsg: commit.message.substring(0, 500),
          status: "pending",
        })
        .returning();

      // TODO: Queue the actual build/deploy job
      // For now, we just create the record
      // In production, this would be sent to a job queue

      return deployment;
    }),
});
