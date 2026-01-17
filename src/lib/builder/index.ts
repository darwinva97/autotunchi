import { spawn } from "child_process";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { downloadRepository, hasDockerfile } from "../github/client";

export interface BuildResult {
  success: boolean;
  imageTag: string;
  logs: string;
  error?: string;
}

export interface BuildOptions {
  accessToken: string;
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  projectSlug: string;
  registryUrl: string;
  registryUsername: string;
  registryPassword: string;
  registryInsecure?: boolean; // For HTTP registries (self-hosted)
  buildCommand?: string;
}

async function extractTarball(
  tarball: ArrayBuffer,
  destDir: string
): Promise<string> {
  const tarPath = join(destDir, "repo.tar.gz");
  await writeFile(tarPath, Buffer.from(tarball));

  return new Promise((resolve, reject) => {
    const tar = spawn("tar", ["-xzf", tarPath, "-C", destDir, "--strip-components=1"], {
      cwd: destDir,
    });

    let error = "";
    tar.stderr.on("data", (data) => {
      error += data.toString();
    });

    tar.on("close", (code) => {
      if (code === 0) {
        resolve(destDir);
      } else {
        reject(new Error(`Failed to extract tarball: ${error}`));
      }
    });
  });
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<{ success: boolean; logs: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
    });

    let logs = "";

    proc.stdout.on("data", (data) => {
      logs += data.toString();
    });

    proc.stderr.on("data", (data) => {
      logs += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ success: code === 0, logs });
    });

    proc.on("error", (err) => {
      logs += `\nError: ${err.message}`;
      resolve({ success: false, logs });
    });
  });
}

async function buildWithDockerfile(
  sourceDir: string,
  imageTag: string,
  registryUrl: string,
  registryUsername: string,
  registryPassword: string,
  insecure: boolean = false
): Promise<{ success: boolean; logs: string }> {
  let logs = "";

  // For insecure registries, we need to use buildx or configure daemon
  // Here we'll use the simpler approach of just attempting the login/push

  // Login to registry (skip if no credentials for local registries)
  if (registryUsername && registryPassword) {
    const loginArgs = ["login", registryUrl, "-u", registryUsername, "--password-stdin"];
    const loginResult = await runCommand(
      "docker",
      loginArgs,
      sourceDir,
      { DOCKER_PASSWORD: registryPassword }
    );
    logs += `=== Docker Login ===\n${loginResult.logs}\n`;

    if (!loginResult.success) {
      return { success: false, logs };
    }
  } else {
    logs += `=== Skipping Docker Login (no credentials) ===\n`;
  }

  // Build image
  const buildResult = await runCommand(
    "docker",
    ["build", "-t", imageTag, "."],
    sourceDir
  );
  logs += `\n=== Docker Build ===\n${buildResult.logs}\n`;

  if (!buildResult.success) {
    return { success: false, logs };
  }

  // Push image
  const pushResult = await runCommand("docker", ["push", imageTag], sourceDir);
  logs += `\n=== Docker Push ===\n${pushResult.logs}\n`;

  return { success: pushResult.success, logs };
}

async function buildWithBuildpacks(
  sourceDir: string,
  imageTag: string,
  registryUrl: string,
  registryUsername: string,
  registryPassword: string
): Promise<{ success: boolean; logs: string }> {
  let logs = "";

  // Using pack CLI with Paketo Buildpacks
  const packResult = await runCommand(
    "pack",
    [
      "build",
      imageTag,
      "--builder",
      "paketobuildpacks/builder-jammy-full:latest",
      "--publish",
    ],
    sourceDir,
    {
      CNB_REGISTRY_AUTH: JSON.stringify({
        [registryUrl]: {
          username: registryUsername,
          password: registryPassword,
        },
      }),
    }
  );

  logs += `=== Pack Build ===\n${packResult.logs}\n`;

  return packResult;
}

export async function buildProject(options: BuildOptions): Promise<BuildResult> {
  const buildId = randomUUID();
  const workDir = join("/tmp", "autotunchi-builds", buildId);
  const imageTag = `${options.registryUrl}/${options.projectSlug}:${options.commitSha.substring(0, 7)}`;

  let logs = "";

  try {
    // Create work directory
    await mkdir(workDir, { recursive: true });
    logs += `=== Downloading source ===\n`;

    // Download repository
    const tarball = await downloadRepository(
      options.accessToken,
      options.owner,
      options.repo,
      options.commitSha
    );
    logs += `Downloaded ${tarball.byteLength} bytes\n`;

    // Extract
    await extractTarball(tarball, workDir);
    logs += `Extracted to ${workDir}\n`;

    // Determine build strategy
    const useDockerfile = await hasDockerfile(
      options.accessToken,
      options.owner,
      options.repo,
      options.branch
    );

    logs += `\n=== Build Strategy: ${useDockerfile ? "Dockerfile" : "Buildpacks"} ===\n`;

    let buildResult: { success: boolean; logs: string };

    if (useDockerfile) {
      buildResult = await buildWithDockerfile(
        workDir,
        imageTag,
        options.registryUrl,
        options.registryUsername,
        options.registryPassword
      );
    } else {
      buildResult = await buildWithBuildpacks(
        workDir,
        imageTag,
        options.registryUrl,
        options.registryUsername,
        options.registryPassword
      );
    }

    logs += buildResult.logs;

    return {
      success: buildResult.success,
      imageTag,
      logs,
      error: buildResult.success ? undefined : "Build failed",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logs += `\n=== Error ===\n${errorMessage}\n`;

    return {
      success: false,
      imageTag,
      logs,
      error: errorMessage,
    };
  } finally {
    // Cleanup
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
