import { createHmac, timingSafeEqual } from "crypto";

export interface PushEvent {
  ref: string;
  after: string;
  repository: {
    full_name: string;
  };
  head_commit: {
    id: string;
    message: string;
  } | null;
  pusher: {
    name: string;
    email: string;
  };
}

export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const parts = signature.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const providedSignature = parts[1];

  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(providedSignature, "hex")
    );
  } catch {
    return false;
  }
}

export function parsePushEvent(payload: unknown): PushEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as Record<string, unknown>;

  if (!event.ref || !event.after || !event.repository) {
    return null;
  }

  return {
    ref: event.ref as string,
    after: event.after as string,
    repository: {
      full_name: (event.repository as Record<string, unknown>).full_name as string,
    },
    head_commit: event.head_commit
      ? {
          id: (event.head_commit as Record<string, unknown>).id as string,
          message: (event.head_commit as Record<string, unknown>).message as string,
        }
      : null,
    pusher: {
      name: (event.pusher as Record<string, unknown>).name as string,
      email: (event.pusher as Record<string, unknown>).email as string,
    },
  };
}

export function extractBranchFromRef(ref: string): string | null {
  const match = ref.match(/^refs\/heads\/(.+)$/);
  return match ? match[1] : null;
}
