// Curated downstream adapter for the official MCP Registry (a metadata service, not a
// code host or security scanner). Discovery only fetches metadata: it never spawns
// processes, connects to listed servers or sends credentials.
import { z } from "zod";
import type { RegistryPage, RegistryServerView } from "@socius/contracts/app";

export const OFFICIAL_REGISTRY = "https://registry.modelcontextprotocol.io";

/** A Socius review of an exact upstream server release and remote endpoint. */
export interface ServerReview {
  name: string;
  versions: string[];
  remoteUrl: string;
  connectorId: string;
  note: string;
}
export const reviewedServers: ServerReview[] = [
  {
    name: "com.notion/mcp",
    versions: ["1.0.0", "1.0.1"],
    remoteUrl: "https://mcp.notion.com/mcp",
    connectorId: "socius/notion",
    note: "Official Notion hosted server. Socius exposes only reviewed search, fetch and create-page actions.",
  },
];

const Remote = z.looseObject({ type: z.string().max(40), url: z.string().url() });
const Package = z.looseObject({
  registryType: z.string().max(40),
  identifier: z.string().max(300),
});
const ServerEntry = z.looseObject({
  server: z.looseObject({
    name: z.string().max(200),
    description: z.string().max(2000).default(""),
    version: z.string().max(64),
    repository: z.looseObject({ url: z.string().optional() }).optional(),
    remotes: z.array(Remote).max(20).optional(),
    packages: z.array(Package).max(20).optional(),
  }),
  _meta: z.record(z.string(), z.unknown()).optional(),
});
const PageSchema = z.looseObject({
  servers: z.array(z.unknown()).max(500),
  metadata: z
    .looseObject({ nextCursor: z.string().max(500).optional() })
    .optional(),
});

export function matchReview(server: {
  name: string;
  version: string;
  remotes: { type: string; url: string }[];
}): ServerReview | undefined {
  // A review applies only to the exact release and endpoint that was reviewed.
  return reviewedServers.find(
    (r) =>
      r.name === server.name &&
      r.versions.includes(server.version) &&
      server.remotes.some(
        (remote) => remote.type === "streamable-http" && remote.url === r.remoteUrl,
      ),
  );
}

export interface RegistryCache {
  get(key: string): RegistryPage | undefined;
  set(key: string, page: RegistryPage): void;
}
export interface RegistryClientOptions {
  baseURL?: string;
  fetch?: typeof fetch;
  cache?: RegistryCache;
  ttlMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

export class RegistryClient {
  private readonly memory = new Map<string, RegistryPage>();
  constructor(private readonly options: RegistryClientOptions = {}) {}
  private cacheGet(key: string) {
    return this.memory.get(key) ?? this.options.cache?.get(key);
  }
  private cacheSet(key: string, page: RegistryPage) {
    this.memory.set(key, page);
    this.options.cache?.set(key, page);
  }
  async search(input: { search?: string; cursor?: string } = {}): Promise<RegistryPage> {
    const search = (input.search ?? "").trim().slice(0, 100);
    const cursor = (input.cursor ?? "").slice(0, 500);
    const key = `${search}\n${cursor}`;
    const cached = this.cacheGet(key);
    const ttl = this.options.ttlMs ?? 10 * 60 * 1000;
    if (cached && !cached.error && Date.now() - Date.parse(cached.fetchedAt) < ttl)
      return structuredClone(cached);
    const url = new URL("/v0.1/servers", this.options.baseURL ?? OFFICIAL_REGISTRY);
    url.searchParams.set("limit", "30");
    url.searchParams.set("version", "latest");
    if (search) url.searchParams.set("search", search);
    if (cursor) url.searchParams.set("cursor", cursor);
    try {
      const page = await this.fetchPage(url);
      this.cacheSet(key, page);
      return page;
    } catch (error) {
      const message =
        error instanceof Error && error.message.startsWith("Registry")
          ? error.message
          : "Registry request failed";
      if (cached) return { ...structuredClone(cached), stale: true, error: message };
      return {
        servers: [],
        nextCursor: null,
        fetchedAt: new Date().toISOString(),
        stale: false,
        skipped: 0,
        error: message,
      };
    }
  }
  private async fetchPage(url: URL): Promise<RegistryPage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429) throw new Error("Registry rate limit reached; try again later");
      if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > (this.options.maxBytes ?? 2 * 1024 * 1024))
        throw new Error("Registry response too large");
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error("Registry returned invalid JSON");
      }
      const parsed = PageSchema.safeParse(body);
      if (!parsed.success) throw new Error("Registry response has an unexpected shape");
      let skipped = 0;
      const servers: RegistryServerView[] = [];
      for (const raw of parsed.data.servers) {
        const entry = ServerEntry.safeParse(raw);
        if (!entry.success) {
          skipped++;
          continue;
        }
        const s = entry.data.server;
        const official = entry.data._meta?.["io.modelcontextprotocol.registry/official"] as
          | { isLatest?: boolean; status?: string }
          | undefined;
        if (official?.status && official.status !== "active") {
          skipped++;
          continue;
        }
        const remotes = (s.remotes ?? []).map((r) => ({ type: r.type, url: r.url }));
        const review = matchReview({ name: s.name, version: s.version, remotes });
        servers.push({
          name: s.name,
          version: s.version,
          description: s.description,
          repositoryUrl: s.repository?.url?.startsWith("https://") ? s.repository.url : null,
          remotes,
          packages: (s.packages ?? []).map((p) => ({
            registryType: p.registryType,
            identifier: p.identifier,
          })),
          isLatest: official?.isLatest ?? true,
          reviewedConnectorId: review?.connectorId ?? null,
          reviewNote: review
            ? review.note
            : "Not reviewed by Socius. Listed for discovery only; it cannot be installed or launched.",
        });
      }
      return {
        servers,
        nextCursor: parsed.data.metadata?.nextCursor ?? null,
        fetchedAt: new Date().toISOString(),
        stale: false,
        skipped,
        error: null,
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Registry request timed out");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
