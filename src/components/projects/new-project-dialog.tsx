"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Loader2, Lock, Globe } from "lucide-react";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [step, setStep] = useState(1);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [projectName, setProjectName] = useState("");
  const [port, setPort] = useState("3000");

  const { data: repos, isLoading: loadingRepos } =
    trpc.projects.getRepositories.useQuery(undefined, {
      enabled: open,
    });

  const { data: branches, isLoading: loadingBranches } =
    trpc.projects.getBranches.useQuery(
      { repoFullName: selectedRepo },
      { enabled: !!selectedRepo }
    );

  const { data: nodes } = trpc.nodes.list.useQuery(undefined, {
    enabled: open && step === 2,
  });

  const [nodeAffinity, setNodeAffinity] = useState<string | undefined>();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      utils.projects.list.invalidate();
      onOpenChange(false);
      router.push(`/projects/${project.id}`);
    },
  });

  const handleRepoSelect = (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    const repo = repos?.find((r) => r.fullName === repoFullName);
    if (repo) {
      setProjectName(repo.name);
      setSelectedBranch(repo.defaultBranch);
    }
  };

  const handleNext = () => {
    if (step === 1 && selectedRepo && selectedBranch) {
      setStep(2);
    }
  };

  const handleCreate = () => {
    createProject.mutate({
      name: projectName,
      repoFullName: selectedRepo,
      branch: selectedBranch,
      port: parseInt(port),
      nodeAffinity,
    });
  };

  const handleClose = () => {
    setStep(1);
    setSelectedRepo("");
    setSelectedBranch("");
    setProjectName("");
    setPort("3000");
    setNodeAffinity(undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Select Repository" : "Configure Project"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Choose a repository to deploy"
              : "Configure your project settings"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            {loadingRepos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {repos?.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => handleRepoSelect(repo.fullName)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      selectedRepo === repo.fullName
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent"
                    }`}
                  >
                    {repo.private ? (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{repo.fullName}</p>
                      {repo.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    {repo.language && (
                      <span className="text-xs text-muted-foreground">
                        {repo.language}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedRepo && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={selectedBranch}
                  onValueChange={setSelectedBranch}
                  disabled={loadingBranches}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-project"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="3000"
              />
              <p className="text-xs text-muted-foreground">
                The port your application listens on
              </p>
            </div>

            <div className="space-y-2">
              <Label>Node Preference (Optional)</Label>
              <Select
                value={nodeAffinity || ""}
                onValueChange={(v) => setNodeAffinity(v || undefined)}
              >
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
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
          )}
          {step === 1 ? (
            <Button
              onClick={handleNext}
              disabled={!selectedRepo || !selectedBranch}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!projectName || createProject.isPending}
            >
              {createProject.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
