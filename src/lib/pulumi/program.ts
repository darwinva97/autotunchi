import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface DeploymentConfig {
  projectSlug: string;
  imageTag: string;
  port: number;
  replicas: number;
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
  nodeAffinity?: string;
  envVars: Record<string, string>;
  subdomain: string;
  customDomain?: string;
  platformDomain: string;
  ingressClass: string;
}

export function createDeploymentProgram(config: DeploymentConfig) {
  return async () => {
    const namespace = "autotunchi";
    const labels = {
      app: config.projectSlug,
      "managed-by": "autotunchi",
    };

    // Ensure namespace exists
    const ns = new k8s.core.v1.Namespace(
      `ns-${config.projectSlug}`,
      {
        metadata: {
          name: namespace,
        },
      },
      { protect: true }
    );

    // Create secret for env vars if any
    let envFrom: k8s.types.input.core.v1.EnvFromSource[] = [];

    if (Object.keys(config.envVars).length > 0) {
      const secret = new k8s.core.v1.Secret(`secret-${config.projectSlug}`, {
        metadata: {
          name: `${config.projectSlug}-env`,
          namespace,
          labels,
        },
        stringData: config.envVars,
      });

      envFrom = [
        {
          secretRef: {
            name: secret.metadata.name,
          },
        },
      ];
    }

    // Build node affinity if specified
    let affinity: k8s.types.input.core.v1.Affinity | undefined;

    if (config.nodeAffinity) {
      affinity = {
        nodeAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [
            {
              weight: 100,
              preference: {
                matchExpressions: [
                  {
                    key: "kubernetes.io/hostname",
                    operator: "In",
                    values: [config.nodeAffinity],
                  },
                ],
              },
            },
          ],
        },
      };
    }

    // Create deployment
    const deployment = new k8s.apps.v1.Deployment(
      `deployment-${config.projectSlug}`,
      {
        metadata: {
          name: config.projectSlug,
          namespace,
          labels,
        },
        spec: {
          replicas: config.replicas,
          selector: {
            matchLabels: labels,
          },
          template: {
            metadata: {
              labels,
            },
            spec: {
              affinity,
              containers: [
                {
                  name: "app",
                  image: config.imageTag,
                  ports: [
                    {
                      containerPort: config.port,
                      name: "http",
                    },
                  ],
                  envFrom,
                  resources: {
                    requests: {
                      cpu: config.cpuRequest,
                      memory: config.memoryRequest,
                    },
                    limits: {
                      cpu: config.cpuLimit,
                      memory: config.memoryLimit,
                    },
                  },
                  livenessProbe: {
                    httpGet: {
                      path: "/",
                      port: "http",
                    },
                    initialDelaySeconds: 30,
                    periodSeconds: 10,
                  },
                  readinessProbe: {
                    httpGet: {
                      path: "/",
                      port: "http",
                    },
                    initialDelaySeconds: 5,
                    periodSeconds: 5,
                  },
                },
              ],
            },
          },
        },
      },
      { dependsOn: [ns] }
    );

    // Create service
    const service = new k8s.core.v1.Service(
      `service-${config.projectSlug}`,
      {
        metadata: {
          name: config.projectSlug,
          namespace,
          labels,
        },
        spec: {
          selector: labels,
          ports: [
            {
              port: 80,
              targetPort: config.port,
              name: "http",
            },
          ],
          type: "ClusterIP",
        },
      },
      { dependsOn: [deployment] }
    );

    // Build hosts for ingress
    const hosts = [`${config.subdomain}.${config.platformDomain}`];
    if (config.customDomain) {
      hosts.push(config.customDomain);
    }

    // Create ingress
    const ingress = new k8s.networking.v1.Ingress(
      `ingress-${config.projectSlug}`,
      {
        metadata: {
          name: config.projectSlug,
          namespace,
          labels,
          annotations: {
            "kubernetes.io/ingress.class": config.ingressClass,
          },
        },
        spec: {
          ingressClassName: config.ingressClass,
          rules: hosts.map((host) => ({
            host,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: service.metadata.name,
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
              ],
            },
          })),
        },
      },
      { dependsOn: [service] }
    );

    return {
      deploymentName: deployment.metadata.name,
      serviceName: service.metadata.name,
      ingressName: ingress.metadata.name,
      hosts: pulumi.output(hosts),
    };
  };
}

export function createDestroyProgram(projectSlug: string) {
  return async () => {
    // Empty program - resources will be destroyed
    return {};
  };
}
