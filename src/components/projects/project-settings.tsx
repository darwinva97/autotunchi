"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

interface Project {
  id: string;
  name: string;
  port: number;
  branch: string;
  nodeAffinity: string | null;
  cpuLimit: string;
  cpuRequest: string;
  memoryLimit: string;
  memoryRequest: string;
  replicas: number;
  customDomain: string | null;
  envVars: Record<string, string>;
}

interface ProjectSettingsProps {
  project: Project;
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  const utils = trpc.useUtils();

  const [port, setPort] = useState(project.port.toString());
  const [nodeAffinity, setNodeAffinity] = useState(project.nodeAffinity || "");
  const [cpuLimit, setCpuLimit] = useState(project.cpuLimit);
  const [memoryLimit, setMemoryLimit] = useState(project.memoryLimit);
  const [replicas, setReplicas] = useState(project.replicas.toString());
  const [customDomain, setCustomDomain] = useState(project.customDomain || "");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    Object.entries(project.envVars as Record<string, string> || {}).map(([key, value]) => ({
      key,
      value,
    }))
  );

  const { data: nodes } = trpc.nodes.list.useQuery();

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id: project.id });
    },
  });

  const handleSave = () => {
    const envVarsObj = envVars.reduce(
      (acc, { key, value }) => {
        if (key.trim()) {
          acc[key.trim()] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    updateProject.mutate({
      id: project.id,
      port: parseInt(port),
      nodeAffinity: nodeAffinity || null,
      cpuLimit,
      memoryLimit,
      replicas: parseInt(replicas),
      customDomain: customDomain || null,
      envVars: envVarsObj,
    });
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index][field] = value;
    setEnvVars(newEnvVars);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Configure your project settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="replicas">Replicas</Label>
              <Input
                id="replicas"
                type="number"
                min="1"
                max="10"
                value={replicas}
                onChange={(e) => setReplicas(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customDomain">Custom Domain (Optional)</Label>
            <Input
              id="customDomain"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="app.example.com"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>Configure CPU and memory limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpuLimit">CPU Limit</Label>
              <Select value={cpuLimit} onValueChange={setCpuLimit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="250m">0.25 CPU</SelectItem>
                  <SelectItem value="500m">0.5 CPU</SelectItem>
                  <SelectItem value="1000m">1 CPU</SelectItem>
                  <SelectItem value="2000m">2 CPU</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memoryLimit">Memory Limit</Label>
              <Select value={memoryLimit} onValueChange={setMemoryLimit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="256Mi">256 MB</SelectItem>
                  <SelectItem value="512Mi">512 MB</SelectItem>
                  <SelectItem value="1Gi">1 GB</SelectItem>
                  <SelectItem value="2Gi">2 GB</SelectItem>
                  <SelectItem value="4Gi">4 GB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Node Affinity</Label>
            <Select value={nodeAffinity} onValueChange={setNodeAffinity}>
              <SelectTrigger>
                <SelectValue placeholder="Auto (any available node)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Auto (any available)</SelectItem>
                {nodes?.map((node) => (
                  <SelectItem key={node.name} value={node.name}>
                    {node.name} - CPU: {node.cpu.usagePercent}%, RAM:{" "}
                    {node.memory.usagePercent}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>
            Configure environment variables for your application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {envVars.map((envVar, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder="KEY"
                value={envVar.key}
                onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                className="font-mono"
              />
              <Input
                placeholder="value"
                value={envVar.value}
                onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                className="font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeEnvVar(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addEnvVar}>
            <Plus className="mr-2 h-4 w-4" />
            Add Variable
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProject.isPending}>
          {updateProject.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
