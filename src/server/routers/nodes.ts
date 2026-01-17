import { router, protectedProcedure } from "@/lib/trpc/init";
import { getNodeMetrics, formatBytes, formatMillicores } from "@/lib/kubernetes/metrics";

export const nodesRouter = router({
  list: protectedProcedure.query(async () => {
    const nodes = await getNodeMetrics();

    return nodes.map((node) => ({
      ...node,
      cpu: {
        ...node.cpu,
        capacityFormatted: formatMillicores(node.cpu.capacity),
        allocatableFormatted: formatMillicores(node.cpu.allocatable),
        usageFormatted: formatMillicores(node.cpu.usage),
      },
      memory: {
        ...node.memory,
        capacityFormatted: formatBytes(node.memory.capacity),
        allocatableFormatted: formatBytes(node.memory.allocatable),
        usageFormatted: formatBytes(node.memory.usage),
      },
    }));
  }),
});
