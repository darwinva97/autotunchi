import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyWebhookSignature,
  parsePushEvent,
  extractBranchFromRef,
} from "@/lib/github/webhooks";
import { projects, deployments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const event = req.headers.get("x-github-event");

    // Only handle push events
    if (event !== "push") {
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    const parsedEvent = parsePushEvent(JSON.parse(payload));
    if (!parsedEvent) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const branch = extractBranchFromRef(parsedEvent.ref);
    if (!branch) {
      return NextResponse.json(
        { message: "Not a branch push" },
        { status: 200 }
      );
    }

    // Find matching project
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.repoFullName, parsedEvent.repository.full_name),
        eq(projects.branch, branch)
      ),
    });

    if (!project) {
      return NextResponse.json(
        { message: "No matching project found" },
        { status: 200 }
      );
    }

    // Verify webhook signature
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifyWebhookSignature(payload, signature, project.webhookSecret)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Create deployment record
    const [deployment] = await db
      .insert(deployments)
      .values({
        projectId: project.id,
        commitSha: parsedEvent.after,
        commitMsg: parsedEvent.head_commit?.message?.substring(0, 500) || null,
        status: "pending",
      })
      .returning();

    // TODO: Queue the actual build/deploy job
    // In a production system, this would send a message to a job queue
    // For now, we just create the deployment record

    console.log(
      `Created deployment ${deployment.id} for project ${project.slug} (commit: ${parsedEvent.after.substring(0, 7)})`
    );

    return NextResponse.json({
      message: "Deployment triggered",
      deploymentId: deployment.id,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle GitHub ping event
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
