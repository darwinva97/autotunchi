import { Octokit } from "octokit";

export function createGitHubClient(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

export interface Repository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
}

export async function listRepositories(
  accessToken: string
): Promise<Repository[]> {
  const octokit = createGitHubClient(accessToken);

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    sort: "updated",
    per_page: 100,
    visibility: "all",
  });

  return repos.map((repo) => ({
    id: repo.id,
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner?.login || "",
    private: repo.private,
    defaultBranch: repo.default_branch,
    description: repo.description,
    language: repo.language,
    updatedAt: repo.updated_at || "",
  }));
}

export async function getRepository(
  accessToken: string,
  owner: string,
  repo: string
): Promise<Repository> {
  const octokit = createGitHubClient(accessToken);

  const { data } = await octokit.rest.repos.get({ owner, repo });

  return {
    id: data.id,
    fullName: data.full_name,
    name: data.name,
    owner: data.owner?.login || "",
    private: data.private,
    defaultBranch: data.default_branch,
    description: data.description,
    language: data.language,
    updatedAt: data.updated_at || "",
  };
}

export async function getBranches(
  accessToken: string,
  owner: string,
  repo: string
): Promise<string[]> {
  const octokit = createGitHubClient(accessToken);

  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });

  return branches.map((b) => b.name);
}

export async function getLatestCommit(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ sha: string; message: string }> {
  const octokit = createGitHubClient(accessToken);

  const { data } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: branch,
  });

  return {
    sha: data.sha,
    message: data.commit.message,
  };
}

export async function hasDockerfile(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  const octokit = createGitHubClient(accessToken);

  try {
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "Dockerfile",
      ref: branch,
    });
    return true;
  } catch {
    return false;
  }
}

export async function createWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<number> {
  const octokit = createGitHubClient(accessToken);

  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret,
    },
    events: ["push"],
    active: true,
  });

  return data.id;
}

export async function deleteWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  hookId: number
): Promise<void> {
  const octokit = createGitHubClient(accessToken);

  await octokit.rest.repos.deleteWebhook({
    owner,
    repo,
    hook_id: hookId,
  });
}

export async function downloadRepository(
  accessToken: string,
  owner: string,
  repo: string,
  ref: string
): Promise<ArrayBuffer> {
  const octokit = createGitHubClient(accessToken);

  const { data } = await octokit.rest.repos.downloadTarballArchive({
    owner,
    repo,
    ref,
  });

  return data as ArrayBuffer;
}
