import * as automation from "@pulumi/pulumi/automation";
import { createDeploymentProgram, DeploymentConfig } from "./program";

// For self-hosted backends, stack names are simpler (no org required)
function getStackName(projectSlug: string): string {
  return `autotunchi-${projectSlug}-prod`;
}

// Get workspace options for self-hosted backend
function getWorkspaceOptions(): automation.LocalWorkspaceOptions {
  const backendUrl = process.env.PULUMI_BACKEND_URL;

  const options: automation.LocalWorkspaceOptions = {};

  if (backendUrl) {
    // For self-hosted backends (file://, s3://, azblob://, gs://)
    options.envVars = {
      PULUMI_BACKEND_URL: backendUrl,
    };

    // Add MinIO credentials if using S3-compatible backend
    // Pulumi SDK requires AWS_* env vars internally, but we use MINIO_* for clarity
    if (backendUrl.startsWith("s3://")) {
      const accessKey = process.env.MINIO_ACCESS_KEY;
      const secretKey = process.env.MINIO_SECRET_KEY;

      if (accessKey) {
        options.envVars.AWS_ACCESS_KEY_ID = accessKey;
      }
      if (secretKey) {
        options.envVars.AWS_SECRET_ACCESS_KEY = secretKey;
      }
    }
  }

  return options;
}

export interface DeployResult {
  success: boolean;
  outputs?: Record<string, unknown>;
  error?: string;
}

export async function deployProject(config: DeploymentConfig): Promise<DeployResult> {
  const stackName = getStackName(config.projectSlug);
  const projectName = `autotunchi-${config.projectSlug}`;
  const workspaceOptions = getWorkspaceOptions();

  try {
    // Create or select the stack with self-hosted backend
    const stack = await automation.LocalWorkspace.createOrSelectStack(
      {
        stackName,
        projectName,
        program: createDeploymentProgram(config),
      },
      {
        ...workspaceOptions,
        projectSettings: {
          name: projectName,
          runtime: "nodejs",
          backend: process.env.PULUMI_BACKEND_URL
            ? { url: process.env.PULUMI_BACKEND_URL }
            : undefined,
        },
      }
    );

    // Set configuration
    await stack.setConfig("kubernetes:context", { value: "default" });

    // Run the update
    const result = await stack.up({
      onOutput: console.log,
    });

    return {
      success: true,
      outputs: result.outputs,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function destroyProject(projectSlug: string): Promise<DeployResult> {
  const stackName = getStackName(projectSlug);
  const projectName = `autotunchi-${projectSlug}`;
  const workspaceOptions = getWorkspaceOptions();

  try {
    const stack = await automation.LocalWorkspace.selectStack(
      {
        stackName,
        projectName,
        program: async () => ({}),
      },
      {
        ...workspaceOptions,
        projectSettings: {
          name: projectName,
          runtime: "nodejs",
          backend: process.env.PULUMI_BACKEND_URL
            ? { url: process.env.PULUMI_BACKEND_URL }
            : undefined,
        },
      }
    );

    await stack.destroy({
      onOutput: console.log,
    });

    // Remove the stack
    await stack.workspace.removeStack(stackName);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getDeploymentStatus(
  projectSlug: string
): Promise<{ exists: boolean; outputs?: Record<string, unknown> }> {
  const stackName = getStackName(projectSlug);
  const projectName = `autotunchi-${projectSlug}`;
  const workspaceOptions = getWorkspaceOptions();

  try {
    const stack = await automation.LocalWorkspace.selectStack(
      {
        stackName,
        projectName,
        program: async () => ({}),
      },
      {
        ...workspaceOptions,
        projectSettings: {
          name: projectName,
          runtime: "nodejs",
          backend: process.env.PULUMI_BACKEND_URL
            ? { url: process.env.PULUMI_BACKEND_URL }
            : undefined,
        },
      }
    );

    const outputs = await stack.outputs();

    return {
      exists: true,
      outputs: Object.fromEntries(
        Object.entries(outputs).map(([k, v]) => [k, v.value])
      ),
    };
  } catch {
    return { exists: false };
  }
}

export async function previewDeployment(
  config: DeploymentConfig
): Promise<{ success: boolean; summary?: string; error?: string }> {
  const stackName = getStackName(config.projectSlug);
  const projectName = `autotunchi-${config.projectSlug}`;
  const workspaceOptions = getWorkspaceOptions();

  try {
    const stack = await automation.LocalWorkspace.createOrSelectStack(
      {
        stackName,
        projectName,
        program: createDeploymentProgram(config),
      },
      {
        ...workspaceOptions,
        projectSettings: {
          name: projectName,
          runtime: "nodejs",
          backend: process.env.PULUMI_BACKEND_URL
            ? { url: process.env.PULUMI_BACKEND_URL }
            : undefined,
        },
      }
    );

    const result = await stack.preview();

    return {
      success: true,
      summary: result.stdout,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
