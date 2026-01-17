import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/projects");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20">
      <div className="max-w-3xl mx-auto text-center px-4">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          AutoTunchi
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Deploy your projects from GitHub to Kubernetes with automatic builds,
          DNS configuration, and resource management.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/login">Get Started</Link>
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">GitHub Integration</h3>
            <p className="text-sm text-muted-foreground">
              Connect your private repositories and deploy with automatic
              webhooks on every push.
            </p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">Smart Builds</h3>
            <p className="text-sm text-muted-foreground">
              Automatic detection of Dockerfile or Buildpacks for any language
              or framework.
            </p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">Cloudflare DNS</h3>
            <p className="text-sm text-muted-foreground">
              Optional automatic DNS configuration with your Cloudflare account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
