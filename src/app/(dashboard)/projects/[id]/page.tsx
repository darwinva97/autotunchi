"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Rocket,
  ExternalLink,
  GitBranch,
  Clock,
  Trash2,
  Settings,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ProjectSettings } from "@/components/projects/project-settings";
import { DeploymentsList } from "@/components/projects/deployments-list";

function getStatusBadge(status: string) {
  switch (status) {
    case "live":
      return <Badge variant="success">Live</Badge>;
    case "building":
      return <Badge variant="warning">Building</Badge>;
    case "deploying":
      return <Badge variant="warning">Deploying</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: project, isLoading } = trpc.projects.get.useQuery({ id });

  const triggerDeploy = trpc.projects.triggerDeploy.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id });
    },
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      router.push("/projects");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  const latestDeployment = project.deployments[0];
  const projectUrl = `https://${project.subdomain}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "example.com"}`;

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {latestDeployment && getStatusBadge(latestDeployment.status)}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              {project.repoFullName} ({project.branch})
            </span>
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              {projectUrl}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => triggerDeploy.mutate({ projectId: id })}
            disabled={triggerDeploy.isPending}
          >
            {triggerDeploy.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Deploy
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              if (confirm("Are you sure you want to delete this project?")) {
                deleteProject.mutate({ id });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="mt-6">
          <DeploymentsList projectId={id} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <ProjectSettings project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
