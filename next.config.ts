import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@pulumi/pulumi", "@pulumi/kubernetes", "@pulumi/cloudflare"],
};

export default nextConfig;
