"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, XCircle, GitCommit, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

interface DeploymentsListProps {
  projectId: string;
}

export function DeploymentsList({ projectId }: DeploymentsListProps) {
  const utils = trpc.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.deployments.list.useInfiniteQuery(
      { projectId, limit: 10 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const cancelDeployment = trpc.deployments.cancel.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate({ projectId });
    },
  });

  const rollback = trpc.deployments.rollback.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate({ projectId });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const deployments = data?.pages.flatMap((page) => page.items) || [];

  if (deployments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No deployments yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {deployments.map((deployment, index) => (
        <Card key={deployment.id}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getStatusBadge(deployment.status)}
                <div>
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <GitCommit className="h-4 w-4 text-muted-foreground" />
                    {deployment.commitSha.substring(0, 7)}
                  </div>
                  {deployment.commitMsg && (
                    <p className="text-sm text-muted-foreground truncate max-w-md">
                      {deployment.commitMsg}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDistanceToNow(new Date(deployment.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                <div className="flex items-center gap-2">
                  {(deployment.status === "pending" ||
                    deployment.status === "building") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        cancelDeployment.mutate({ id: deployment.id })
                      }
                      disabled={cancelDeployment.isPending}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                  {deployment.status === "live" && index > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        rollback.mutate({ deploymentId: deployment.id })
                      }
                      disabled={rollback.isPending}
                    >
                      <RotateCcw className="mr-1 h-4 w-4" />
                      Rollback
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {deployment.error && (
              <p className="mt-2 text-sm text-destructive">{deployment.error}</p>
            )}
          </CardContent>
        </Card>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
