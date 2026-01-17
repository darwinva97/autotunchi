import { db } from "@/lib/db";
import { getGitHubAccessToken } from "@/lib/auth";
import { buildProject } from "@/lib/builder";
import { deployProject } from "@/lib/pulumi/automation";
import { setupProjectDns } from "@/lib/cloudflare/dns";
import { decryptJson } from "@/lib/crypto";
import { deployments, projects, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface DeploymentJob {
  deploymentId: string;
}

export async function processDeployment(job: DeploymentJob): Promise<void> {
  const { deploymentId } = job;

  // Get deployment with project and user
  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
    with: {
      project: {
        with: {
          user: true,
        },
      },
    },
  });

  if (!deployment) {
    console.error(`Deployment ${deploymentId} not found`);
    return;
  }

  const { project } = deployment;
  const [owner, repo] = project.repoFullName.split("/");

  try {
    // Update status to building
    await db
      .update(deployments)
      .set({ status: "building" })
      .where(eq(deployments.id, deploymentId));

    // Get GitHub token
    const accessToken = await getGitHubAccessToken(project.userId);
    if (!accessToken) {
      throw new Error("GitHub access token not found");
    }

    // Build the project
    const buildResult = await buildProject({
      accessToken,
      owner,
      repo,
      branch: project.branch,
      commitSha: deployment.commitSha,
      projectSlug: project.slug,
      registryUrl: process.env.REGISTRY_URL!,
      registryUsername: process.env.REGISTRY_USERNAME!,
      registryPassword: process.env.REGISTRY_PASSWORD!,
      buildCommand: project.buildCommand || undefined,
    });

    // Update with build logs
    await db
      .update(deployments)
      .set({ buildLogs: buildResult.logs })
      .where(eq(deployments.id, deploymentId));

    if (!buildResult.success) {
      throw new Error(buildResult.error || "Build failed");
    }

    // Update status to deploying
    await db
      .update(deployments)
      .set({
        status: "deploying",
        imageTag: buildResult.imageTag,
      })
      .where(eq(deployments.id, deploymentId));

    // Decrypt env vars
    const envVars = decryptJson(JSON.stringify(project.envVars));

    // Deploy with Pulumi
    const deployResult = await deployProject({
      projectSlug: project.slug,
      imageTag: buildResult.imageTag,
      port: project.port,
      replicas: project.replicas,
      cpuRequest: project.cpuRequest,
      cpuLimit: project.cpuLimit,
      memoryRequest: project.memoryRequest,
      memoryLimit: project.memoryLimit,
      nodeAffinity: project.nodeAffinity || undefined,
      envVars,
      subdomain: project.subdomain,
      customDomain: project.customDomain || undefined,
      platformDomain: process.env.PLATFORM_DOMAIN!,
      ingressClass: process.env.INGRESS_CLASS || "nginx",
    });

    if (!deployResult.success) {
      throw new Error(deployResult.error || "Deployment failed");
    }

    // Setup Cloudflare DNS if configured
    if (project.user.cloudflareToken && project.user.cloudflareZone) {
      try {
        const ingressIp = process.env.INGRESS_IP || "127.0.0.1";
        const fullDomain = `${project.subdomain}.${process.env.PLATFORM_DOMAIN}`;

        await setupProjectDns(
          project.user.cloudflareToken,
          project.user.cloudflareZone,
          fullDomain,
          ingressIp
        );

        // Also setup custom domain if configured
        if (project.customDomain) {
          await setupProjectDns(
            project.user.cloudflareToken,
            project.user.cloudflareZone,
            project.customDomain,
            ingressIp
          );
        }
      } catch (error) {
        console.error("Failed to setup DNS:", error);
        // Don't fail deployment if DNS setup fails
      }
    }

    // Mark as live
    await db
      .update(deployments)
      .set({
        status: "live",
        finishedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    console.log(`Deployment ${deploymentId} completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(deployments)
      .set({
        status: "failed",
        error: errorMessage,
        finishedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    console.error(`Deployment ${deploymentId} failed:`, errorMessage);
  }
}
