"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Server, Cpu, HardDrive, Box } from "lucide-react";

function getStatusBadge(status: string) {
  switch (status) {
    case "Ready":
      return <Badge variant="success">Ready</Badge>;
    case "NotReady":
      return <Badge variant="destructive">Not Ready</Badge>;
    default:
      return <Badge variant="secondary">Unknown</Badge>;
  }
}

function getProgressColor(percent: number): string {
  if (percent < 50) return "bg-green-500";
  if (percent < 80) return "bg-yellow-500";
  return "bg-red-500";
}

export default function NodesPage() {
  const { data: nodes, isLoading, error } = trpc.nodes.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">
          Failed to load nodes: {error.message}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Make sure your Kubernetes cluster is accessible and metrics-server is installed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Nodes</h1>
        <p className="text-muted-foreground">
          Monitor your Kubernetes nodes and their resource usage
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {nodes?.map((node) => (
          <Card key={node.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  {node.name}
                </CardTitle>
                {getStatusBadge(node.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* CPU */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    CPU
                  </span>
                  <span className="text-muted-foreground">
                    {node.cpu.usageFormatted} / {node.cpu.allocatableFormatted}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={node.cpu.usagePercent} className="h-2" />
                  <div
                    className={`absolute inset-0 h-2 rounded-full ${getProgressColor(node.cpu.usagePercent)}`}
                    style={{ width: `${node.cpu.usagePercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {node.cpu.usagePercent}% used
                </p>
              </div>

              {/* Memory */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Memory
                  </span>
                  <span className="text-muted-foreground">
                    {node.memory.usageFormatted} / {node.memory.allocatableFormatted}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={node.memory.usagePercent} className="h-2" />
                  <div
                    className={`absolute inset-0 h-2 rounded-full ${getProgressColor(node.memory.usagePercent)}`}
                    style={{ width: `${node.memory.usagePercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {node.memory.usagePercent}% used
                </p>
              </div>

              {/* Pods */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-muted-foreground" />
                    Pods
                  </span>
                  <span className="text-muted-foreground">
                    {node.pods.running} / {node.pods.allocatable}
                  </span>
                </div>
                <Progress
                  value={(node.pods.running / node.pods.allocatable) * 100}
                  className="h-2"
                />
              </div>

              {/* Labels */}
              {Object.keys(node.labels).length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Labels</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(node.labels)
                      .filter(([key]) => !key.startsWith("kubernetes.io/"))
                      .slice(0, 5)
                      .map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}={value}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {/* Taints */}
              {node.taints.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Taints</p>
                  <div className="flex flex-wrap gap-1">
                    {node.taints.map((taint, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {taint.key}:{taint.effect}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {nodes?.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">
              No nodes found in the cluster
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
