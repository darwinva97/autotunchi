import { getCoreApi, getMetricsApi } from "./client";

export interface NodeMetrics {
  name: string;
  status: "Ready" | "NotReady" | "Unknown";
  cpu: {
    capacity: number; // millicores
    allocatable: number;
    usage: number;
    usagePercent: number;
  };
  memory: {
    capacity: number; // bytes
    allocatable: number;
    usage: number;
    usagePercent: number;
  };
  pods: {
    capacity: number;
    allocatable: number;
    running: number;
  };
  labels: Record<string, string>;
  taints: Array<{ key: string; value?: string; effect: string }>;
  createdAt: string;
}

function parseResourceValue(value: string): number {
  if (!value) return 0;

  // CPU: "1", "500m", "1000m" -> millicores
  if (value.endsWith("m")) {
    return parseInt(value.slice(0, -1), 10);
  }
  if (value.endsWith("n")) {
    return parseInt(value.slice(0, -1), 10) / 1_000_000;
  }

  // Memory: "1Ki", "1Mi", "1Gi", "1000000" -> bytes
  const numValue = parseInt(value, 10);
  if (value.endsWith("Ki")) {
    return numValue * 1024;
  }
  if (value.endsWith("Mi")) {
    return numValue * 1024 * 1024;
  }
  if (value.endsWith("Gi")) {
    return numValue * 1024 * 1024 * 1024;
  }
  if (value.endsWith("Ti")) {
    return numValue * 1024 * 1024 * 1024 * 1024;
  }

  // CPU without suffix is in cores, convert to millicores
  if (!isNaN(numValue) && !value.match(/[a-zA-Z]/)) {
    // Check if it's a CPU value (small number) or memory (large number)
    if (numValue < 1000) {
      return numValue * 1000; // cores to millicores
    }
    return numValue; // bytes
  }

  return numValue || 0;
}

export async function getNodeMetrics(): Promise<NodeMetrics[]> {
  const coreApi = getCoreApi();
  const metricsApi = getMetricsApi();

  // Get nodes
  const nodesResponse = await coreApi.listNode();
  const nodes = nodesResponse.items;

  // Get metrics from metrics-server
  let nodeMetricsData: Record<string, { cpu: string; memory: string }> = {};

  try {
    const metricsResponse = await metricsApi.listClusterCustomObject({
      group: "metrics.k8s.io",
      version: "v1beta1",
      plural: "nodes",
    });

    const items = (metricsResponse as { items?: Array<{ metadata?: { name?: string }; usage?: { cpu?: string; memory?: string } }> }).items || [];
    for (const item of items) {
      const name = item.metadata?.name;
      if (name) {
        nodeMetricsData[name] = {
          cpu: item.usage?.cpu || "0",
          memory: item.usage?.memory || "0",
        };
      }
    }
  } catch (error) {
    console.warn("Failed to get node metrics from metrics-server:", error);
  }

  // Get pod counts per node
  const podsResponse = await coreApi.listPodForAllNamespaces();
  const podCountByNode: Record<string, number> = {};

  for (const pod of podsResponse.items) {
    const nodeName = pod.spec?.nodeName;
    if (nodeName && pod.status?.phase === "Running") {
      podCountByNode[nodeName] = (podCountByNode[nodeName] || 0) + 1;
    }
  }

  return nodes.map((node) => {
    const name = node.metadata?.name || "unknown";
    const status = node.status?.conditions?.find((c) => c.type === "Ready");
    const capacity = node.status?.capacity || {};
    const allocatable = node.status?.allocatable || {};
    const metrics = nodeMetricsData[name] || { cpu: "0", memory: "0" };

    const cpuCapacity = parseResourceValue(capacity.cpu || "0");
    const cpuAllocatable = parseResourceValue(allocatable.cpu || "0");
    const cpuUsage = parseResourceValue(metrics.cpu);

    const memCapacity = parseResourceValue(capacity.memory || "0");
    const memAllocatable = parseResourceValue(allocatable.memory || "0");
    const memUsage = parseResourceValue(metrics.memory);

    const podCapacity = parseInt(capacity.pods || "0", 10);
    const podAllocatable = parseInt(allocatable.pods || "0", 10);

    return {
      name,
      status: status?.status === "True" ? "Ready" : status?.status === "False" ? "NotReady" : "Unknown",
      cpu: {
        capacity: cpuCapacity,
        allocatable: cpuAllocatable,
        usage: cpuUsage,
        usagePercent: cpuAllocatable > 0 ? Math.round((cpuUsage / cpuAllocatable) * 100) : 0,
      },
      memory: {
        capacity: memCapacity,
        allocatable: memAllocatable,
        usage: memUsage,
        usagePercent: memAllocatable > 0 ? Math.round((memUsage / memAllocatable) * 100) : 0,
      },
      pods: {
        capacity: podCapacity,
        allocatable: podAllocatable,
        running: podCountByNode[name] || 0,
      },
      labels: node.metadata?.labels || {},
      taints:
        node.spec?.taints?.map((t) => ({
          key: t.key || "",
          value: t.value,
          effect: t.effect || "",
        })) || [],
      createdAt: node.metadata?.creationTimestamp?.toISOString() || "",
    };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "Ki", "Mi", "Gi", "Ti"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatMillicores(millicores: number): string {
  if (millicores >= 1000) {
    return `${(millicores / 1000).toFixed(1)} cores`;
  }
  return `${millicores}m`;
}
