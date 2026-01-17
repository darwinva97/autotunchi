import { decrypt } from "../crypto";

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export class CloudflareClient {
  private apiToken: string;
  private zoneId: string;
  private baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(encryptedToken: string, zoneId: string) {
    this.apiToken = decrypt(encryptedToken);
    this.zoneId = zoneId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: CloudflareResponse<T> = await response.json();

    if (!data.success) {
      const errorMsg = data.errors.map((e) => e.message).join(", ");
      throw new Error(`Cloudflare API error: ${errorMsg}`);
    }

    return data.result;
  }

  async listDnsRecords(name?: string): Promise<DnsRecord[]> {
    const params = new URLSearchParams();
    if (name) params.set("name", name);

    return this.request<DnsRecord[]>(
      "GET",
      `/zones/${this.zoneId}/dns_records?${params.toString()}`
    );
  }

  async createDnsRecord(
    type: "A" | "AAAA" | "CNAME",
    name: string,
    content: string,
    proxied = true
  ): Promise<DnsRecord> {
    return this.request<DnsRecord>("POST", `/zones/${this.zoneId}/dns_records`, {
      type,
      name,
      content,
      proxied,
      ttl: 1, // Auto TTL when proxied
    });
  }

  async updateDnsRecord(
    recordId: string,
    type: "A" | "AAAA" | "CNAME",
    name: string,
    content: string,
    proxied = true
  ): Promise<DnsRecord> {
    return this.request<DnsRecord>(
      "PUT",
      `/zones/${this.zoneId}/dns_records/${recordId}`,
      {
        type,
        name,
        content,
        proxied,
        ttl: 1,
      }
    );
  }

  async deleteDnsRecord(recordId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      "DELETE",
      `/zones/${this.zoneId}/dns_records/${recordId}`
    );
  }

  async upsertDnsRecord(
    type: "A" | "AAAA" | "CNAME",
    name: string,
    content: string,
    proxied = true
  ): Promise<DnsRecord> {
    const existing = await this.listDnsRecords(name);
    const record = existing.find((r) => r.type === type && r.name === name);

    if (record) {
      return this.updateDnsRecord(record.id, type, name, content, proxied);
    }

    return this.createDnsRecord(type, name, content, proxied);
  }
}

export async function setupProjectDns(
  encryptedToken: string,
  zoneId: string,
  subdomain: string,
  ingressIp: string
): Promise<void> {
  const client = new CloudflareClient(encryptedToken, zoneId);

  // Create A record pointing to the ingress controller's IP
  await client.upsertDnsRecord("A", subdomain, ingressIp, true);
}

export async function removeProjectDns(
  encryptedToken: string,
  zoneId: string,
  subdomain: string
): Promise<void> {
  const client = new CloudflareClient(encryptedToken, zoneId);

  const records = await client.listDnsRecords(subdomain);

  for (const record of records) {
    await client.deleteDnsRecord(record.id);
  }
}

export async function validateCloudflareToken(token: string): Promise<{
  valid: boolean;
  zones?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!data.success) {
      return { valid: false, error: "Invalid token" };
    }

    // Get zones the token has access to
    const zonesResponse = await fetch(
      "https://api.cloudflare.com/client/v4/zones",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const zonesData: CloudflareResponse<Array<{ id: string; name: string }>> =
      await zonesResponse.json();

    if (!zonesData.success) {
      return { valid: true, zones: [] };
    }

    return {
      valid: true,
      zones: zonesData.result.map((z) => ({ id: z.id, name: z.name })),
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
