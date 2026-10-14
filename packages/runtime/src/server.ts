import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { z } from "zod";
import { instantiateBot } from "@socius/marketplace";
import {
  RegistryClient,
  type RegistryClientOptions,
} from "@socius/marketplace/registry";
import { reviewedConnectors } from "@socius/connectors";
import {
  Capability,
  Digest,
  type BotInstance,
  type BotManifest,
  type SkillManifest,
} from "@socius/contracts";
import type {
  Approval,
  BotDraft,
  Installation,
  Message,
  RegistryPage,
  Task,
} from "@socius/contracts/app";
import { Store } from "./store.js";
import { runModel, type ConnectorTool, type ModelRunner } from "./model.js";
import { PackageError, PackageService } from "./packages.js";
import { ConnectionService, type SecretBox } from "./connections.js";
import { ActionBroker, type BrokerOptions } from "./broker.js";
export type { SecretBox };

export interface RuntimeOptions {
  dataDir: string;
  webDir?: string;
  port?: number;
  secretBox?: SecretBox;
  runner?: ModelRunner;
  /** Opens connector sign-in pages in the system browser (desktop). */
  openExternal?: (url: string) => void;
  /** Test-only: fixture endpoints and fetch for connectors and the registry. */
  connectorEndpoints?: Record<string, string>;
  connectorFetch?: typeof fetch;
  registry?: RegistryClientOptions;
  broker?: BrokerOptions;
}
const BotExportDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1024),
  role: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(20000),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  license: z.string().trim().min(1).max(200),
});
const GRANTABLE = ["documents.read", "documents.write"] as const;
const callbackPage = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>Socius</title><body style="font:16px system-ui;padding:48px;max-width:520px;margin:auto"><h1 style="font-size:20px">Socius</h1><p>${message.replace(/[<>&"]/g, "")}</p></body>`;
const BotDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(200),
  // Matches the bot template limit, so any valid template can be installed.
  instructions: z.string().trim().min(1).max(20000),
});
const uuid = z.string().uuid();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
async function body(
  req: IncomingMessage,
  limit = 1024 * 1024,
): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "Expected JSON");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, "Request too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return fail(400, "Invalid JSON");
  }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

export async function startRuntime(options: RuntimeOptions) {
  const store = new Store(options.dataDir);
  const packages = new PackageService(store);
  let pairingToken = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  const active = new Map<string, AbortController>();
  let origin = "";
  const connections = new ConnectionService(
    store,
    {
      secretBox: options.secretBox,
      endpoints: options.connectorEndpoints,
      fetch: options.connectorFetch,
      openExternal: options.openExternal,
    },
    () => origin,
  );
  const broker = new ActionBroker(store, packages, connections, options.broker);
  // Persist only the few most recent registry pages so searches cannot grow the database.
  type CachedPages = { entries: { key: string; page: RegistryPage }[] };
  const REGISTRY_CACHE_ENTRIES = 10;
  const registry = new RegistryClient({
    cache: {
      get: (key) =>
        store
          .get<CachedPages>("registry-cache", "recent")
          ?.entries.find((e) => e.key === key)?.page,
      set: (key, page) => {
        const entries = (
          store.get<CachedPages>("registry-cache", "recent")?.entries ?? []
        ).filter((e) => e.key !== key);
        store.put("registry-cache", "recent", {
          entries: [{ key, page }, ...entries].slice(0, REGISTRY_CACHE_ENTRIES),
        });
      },
    },
    ...options.registry,
  });
  function skillRelease(id: string) {
    return (
      packages.active("skill").find((r) => r.manifest.id === id) ??
      fail(404, "That skill is not installed and enabled")
    );
  }
  // Model tools for reviewed connector actions. Every call goes through the broker,
  // which rechecks installation, consent, grants and connection state.
  function connectorTools(b: BotInstance, taskId: string): ConnectorTool[] {
    const tools: ConnectorTool[] = [];
    for (const connector of reviewedConnectors) {
      if (!store.get<Installation>("installation", connector.id)?.enabled)
        continue;
      if (connections.forConnector(connector.id)?.state !== "ready") continue;
      for (const action of connector.actions) {
        if (!b.grantedCapabilities.includes(action.capability)) continue;
        tools.push({
          name: action.toolName,
          description: action.description,
          inputSchema: action.params,
          execute: async (args) => {
            const current = store.get<Installation>(
              "installation",
              connector.id,
            );
            if (!current) return { error: "The connector was uninstalled" };
            const result = await broker.request({
              actor: { botId: b.id, taskId },
              release: {
                id: current.id,
                version: current.version,
                digest: current.digest,
              },
              action: action.id,
              arguments: args,
            });
            return result.status === "completed"
              ? { summary: result.summary, untrustedData: result.data }
              : {
                  status: "awaiting-approval",
                  summary: result.summary,
                  note: "The user must approve this exact change in Socius. It has not happened yet.",
                };
          },
        });
      }
    }
    return tools;
  }
  function bot(id: string): BotInstance {
    return (
      store.get<BotInstance>("bot", uuid.parse(id)) ??
      fail(404, "Bot not found")
    );
  }
  function createBot(draft: BotDraft, template?: BotManifest) {
    const parsed = BotDraftSchema.parse(draft);
    const instance = instantiateBot(
      template ?? {
        schemaVersion: 1,
        id: `local/bot-${randomUUID()}`,
        version: "0.1.0",
        kind: "bot",
        name: parsed.name,
        description: parsed.role,
        publisher: "You",
        license: "Private",
        capabilities: ["memory.read", "memory.write"],
        dependencies: [],
        role: parsed.role,
        instructions: parsed.instructions,
        modelRequirement: "tools",
      },
      parsed.name,
    );
    instance.role = parsed.role;
    instance.instructions = parsed.instructions;
    store.put("bot", instance.id, instance);
    store.event("bot.created", `Created ${instance.name}.`);
    return instance;
  }
  function proposal(
    botId: string,
    taskId: string,
    kind: "memory" | "bot",
    payload: string | BotDraft,
  ) {
    if (
      store.all<Approval>("approval").filter((a) => a.taskId === taskId)
        .length >= 5
    )
      fail(429, "Proposal limit reached");
    const approval: Approval = {
      id: randomUUID(),
      botId,
      taskId,
      kind,
      payload,
      content:
        typeof payload === "string"
          ? payload
          : `Create ${payload.name} — ${payload.role}`,
      digest: digest({ botId, taskId, kind, payload }),
      state: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    store.put("approval", approval.id, approval);
    store.event(
      "approval.requested",
      kind === "bot"
        ? "A bot creation proposal needs review."
        : "A memory proposal needs review.",
    );
    return { approvalId: approval.id };
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const expectedHost = new URL(origin).host;
      if (req.headers.host !== expectedHost) fail(403, "Invalid host");
      const url = new URL(req.url ?? "/", origin);
      // OAuth redirects arrive from the system browser without the app session; the
      // one-time state created by an explicit sign-in authenticates them instead.
      if (req.method === "GET" && url.pathname === "/oauth/callback") {
        const result = await connections.callback(url.searchParams);
        res.writeHead(result.ok ? 200 : 400, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(callbackPage(result.message));
        return;
      }
      if (req.method === "GET" && url.pathname === "/pair") {
        const token = url.searchParams.get("token") ?? "";
        if (!pairingToken || !same(token, pairingToken))
          fail(403, "Invalid or expired pairing token");
        pairingToken = "";
        res.writeHead(303, {
          "Set-Cookie": `socius_session=${session}; HttpOnly; SameSite=Strict; Path=/`,
          Location: "/",
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        const cookie =
          (req.headers.cookie ?? "")
            .split(";")
            .map((s) => s.trim())
            .find((s) => s.startsWith("socius_session="))
            ?.slice(15) ?? "";
        if (!same(cookie, session))
          fail(401, "Pair this browser with Socius first");
        if (req.headers.origin && req.headers.origin !== origin)
          fail(403, "Invalid origin");
        if (req.headers["sec-fetch-site"] === "cross-site")
          fail(403, "Cross-site request blocked");
        if (req.method !== "GET" && req.headers.origin !== origin)
          fail(403, "Mutation requires the paired application origin");
        const path = url.pathname;
        if (req.method === "GET" && path === "/api/state") {
          json(res, 200, {
            bots: store.all("bot"),
            catalog: packages.catalog.list(),
            releases: packages.releases(),
            installations: store.all("installation"),
            connections: connections.list(),
            actions: store.all("action").slice(-100),
            activity: store.all("activity").slice(-100).reverse(),
            approvals: store.all("approval"),
            tasks: store.all("task"),
            settings: store.settings(),
            secretStorage: !!options.secretBox,
          });
          return;
        }
        if (req.method === "POST" && path === "/api/bots") {
          json(res, 201, createBot(BotDraftSchema.parse(await body(req))));
          return;
        }
        if (req.method === "GET" && path === "/api/messages") {
          json(
            res,
            200,
            store.messages(bot(url.searchParams.get("botId") ?? "").id),
          );
          return;
        }
        if (req.method === "GET" && path === "/api/memory") {
          const b = bot(url.searchParams.get("botId") ?? "");
          json(
            res,
            200,
            url.searchParams.get("q")
              ? store.searchMemory(b.id, url.searchParams.get("q")!)
              : store.memory(b.id),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/memory") {
          const input = z
            .strictObject({
              botId: uuid,
              content: z.string().trim().min(1).max(5000),
              id: uuid.optional(),
            })
            .parse(await body(req));
          bot(input.botId);
          if (
            input.id &&
            !store.memory(input.botId).some((m) => m.id === input.id)
          )
            fail(404, "Memory not found");
          json(
            res,
            200,
            store.saveMemory(
              input.botId,
              input.content,
              "User editor",
              input.id,
            ),
          );
          return;
        }
        if (req.method === "DELETE" && path === "/api/memory") {
          const input = z
            .strictObject({ botId: uuid, id: uuid })
            .parse(await body(req));
          if (!store.memory(bot(input.botId).id).some((m) => m.id === input.id))
            fail(404, "Memory not found");
          store.deleteMemory(input.id);
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && path === "/api/grants") {
          const input = z
            .union([
              z.strictObject({ botId: uuid, memory: z.boolean() }),
              z.strictObject({
                botId: uuid,
                capability: z.enum(GRANTABLE),
                granted: z.boolean(),
              }),
            ])
            .parse(await body(req));
          const b = bot(input.botId);
          if ("memory" in input) {
            const others = b.grantedCapabilities.filter(
              (c) => !c.startsWith("memory."),
            );
            b.grantedCapabilities = input.memory
              ? [...others, "memory.read", "memory.write"]
              : others;
            store.event(
              "permissions.updated",
              `Memory access ${input.memory ? "enabled" : "revoked"} for ${b.name}.`,
            );
          } else {
            if (
              input.granted &&
              !store
                .all<Installation>("installation")
                .some(
                  (i) =>
                    i.enabled &&
                    i.consentedCapabilities.includes(input.capability),
                )
            )
              fail(409, "No enabled package was consented for that permission");
            const others = b.grantedCapabilities.filter(
              (c) => c !== input.capability,
            );
            b.grantedCapabilities = input.granted
              ? [...others, input.capability]
              : others;
            store.event(
              "permissions.updated",
              `${input.capability} ${input.granted ? "granted to" : "revoked from"} ${b.name}.`,
            );
          }
          store.put("bot", b.id, b);
          json(res, 200, b);
          return;
        }
        if (req.method === "POST" && path === "/api/install/preview") {
          const input = z
            .strictObject({
              id: z.string().max(130),
              version: z.string().max(20),
            })
            .parse(await body(req));
          json(res, 200, packages.preview(input.id, input.version));
          return;
        }
        if (req.method === "POST" && path === "/api/install") {
          const input = z
            .strictObject({
              id: z.string().max(130),
              version: z.string().max(20),
              digest: z.string().length(64),
              consent: z.array(Capability).max(20).default([]),
            })
            .parse(await body(req));
          json(
            res,
            200,
            packages.install(input, (template: BotManifest) =>
              createBot(
                {
                  name: template.name,
                  role: template.role,
                  instructions: template.instructions,
                },
                template,
              ),
            ),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/installations/enable") {
          const input = z
            .strictObject({ id: z.string().max(130), enabled: z.boolean() })
            .parse(await body(req));
          json(res, 200, packages.setEnabled(input.id, input.enabled));
          return;
        }
        if (req.method === "POST" && path === "/api/installations/uninstall") {
          const input = z
            .strictObject({ id: z.string().max(130) })
            .parse(await body(req));
          packages.uninstall(input.id);
          // Removing a connector also revokes its stored account credentials.
          for (const c of connections.list())
            if (c.connectorId === input.id && c.state !== "disconnected")
              await connections.disconnect(c.id);
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && path === "/api/installations/rollback") {
          const input = z
            .strictObject({ id: z.string().max(130) })
            .parse(await body(req));
          json(res, 200, packages.rollback(input.id));
          return;
        }
        if (req.method === "POST" && path === "/api/skills/import") {
          const input = z
            .strictObject({
              label: z.string().max(200).default("Local folder"),
              files: z
                .array(
                  z.strictObject({
                    path: z.string().min(1).max(400),
                    content: z.string().max(8 * 1024 * 1024),
                  }),
                )
                .min(1)
                .max(250),
            })
            .parse(await body(req, 8 * 1024 * 1024));
          json(
            res,
            200,
            packages.importSkill(
              input.files.map((f) => ({
                path: f.path,
                bytes: new Uint8Array(Buffer.from(f.content, "base64")),
              })),
              input.label,
            ),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/templates/import") {
          const input = z
            .strictObject({
              label: z.string().max(200).default("Template file"),
              manifest: z.unknown(),
            })
            .parse(await body(req));
          json(res, 200, packages.importTemplate(input.manifest, input.label));
          return;
        }
        if (req.method === "POST" && path === "/api/export/skill/preview") {
          const input = z
            .strictObject({
              id: z.string().max(130),
              version: z.string().max(20),
            })
            .parse(await body(req));
          json(res, 200, packages.exportSkillPreview(input.id, input.version));
          return;
        }
        if (req.method === "POST" && path === "/api/export/skill") {
          const input = z
            .strictObject({
              id: z.string().max(130),
              version: z.string().max(20),
              digest: Digest,
              acknowledge: z.boolean().default(false),
            })
            .parse(await body(req));
          json(
            res,
            200,
            packages.exportSkill(
              input.id,
              input.version,
              input.digest,
              input.acknowledge,
            ),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/export/bot/preview") {
          const input = z
            .strictObject({ botId: uuid, draft: BotExportDraftSchema })
            .parse(await body(req));
          const b = bot(input.botId);
          const { manifest: _manifest, ...preview } = packages.botExportPreview(
            b,
            input.draft,
            store.memory(b.id),
          );
          json(res, 200, preview);
          return;
        }
        if (req.method === "POST" && path === "/api/export/bot") {
          const input = z
            .strictObject({
              botId: uuid,
              draft: BotExportDraftSchema,
              digest: Digest,
              acknowledge: z.boolean().default(false),
            })
            .parse(await body(req));
          const b = bot(input.botId);
          json(
            res,
            200,
            packages.exportBot(
              b,
              input.draft,
              store.memory(b.id),
              input.digest,
              input.acknowledge,
            ),
          );
          return;
        }
        if (req.method === "GET" && path === "/api/registry") {
          json(
            res,
            200,
            await registry.search({
              search: url.searchParams.get("search") ?? "",
              cursor: url.searchParams.get("cursor") ?? "",
            }),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/connectors/connect") {
          const input = z
            .strictObject({ connectorId: z.string().max(130) })
            .parse(await body(req));
          if (
            !store.get<Installation>("installation", input.connectorId)?.enabled
          )
            fail(409, "Install and enable the connector first");
          json(res, 200, await connections.connect(input.connectorId));
          return;
        }
        if (req.method === "POST" && path === "/api/connectors/verify") {
          const input = z
            .strictObject({ connectionId: uuid })
            .parse(await body(req));
          json(res, 200, await connections.verify(input.connectionId));
          return;
        }
        if (req.method === "POST" && path === "/api/connectors/disconnect") {
          const input = z
            .strictObject({ connectionId: uuid })
            .parse(await body(req));
          json(res, 200, await connections.disconnect(input.connectionId));
          return;
        }
        if (req.method === "POST" && path === "/api/actions/resolve") {
          const input = z
            .strictObject({
              id: uuid,
              digest: z.string().length(64),
              approve: z.boolean(),
            })
            .parse(await body(req));
          json(res, 200, await broker.resolve(input));
          return;
        }
        if (req.method === "POST" && path === "/api/actions/check") {
          const input = z.strictObject({ id: uuid }).parse(await body(req));
          json(res, 200, await broker.check(input.id));
          return;
        }
        if (req.method === "POST" && path === "/api/actions/retry") {
          const input = z.strictObject({ id: uuid }).parse(await body(req));
          json(res, 200, await broker.retry(input.id));
          return;
        }
        if (req.method === "POST" && path === "/api/approvals") {
          const input = z
            .strictObject({
              id: uuid,
              digest: z.string().length(64),
              approve: z.boolean(),
            })
            .parse(await body(req));
          const approval =
            store.get<Approval>("approval", input.id) ??
            fail(404, "Approval not found");
          if (approval.state !== "pending")
            fail(409, "This proposal was already resolved");
          if (
            !same(approval.digest, input.digest) ||
            approval.digest !==
              digest({
                botId: approval.botId,
                taskId: approval.taskId,
                kind: approval.kind,
                payload: approval.payload,
              })
          )
            fail(409, "Proposal content changed");
          if (Date.parse(approval.expiresAt) < Date.now())
            fail(409, "Proposal expired");
          if (input.approve) {
            const b = bot(approval.botId);
            if (approval.kind === "memory") {
              if (!b.grantedCapabilities.includes("memory.write"))
                fail(403, "Memory permission was revoked");
              store.saveMemory(
                b.id,
                z.string().min(1).max(5000).parse(approval.payload),
                `Approved proposal from task ${approval.taskId}`,
                approval.id,
              );
            } else {
              if (b.template.id !== "socius/main")
                fail(403, "Only the main bot can propose specialists");
              store.transaction(() => {
                createBot(BotDraftSchema.parse(approval.payload));
                approval.state = "approved";
                store.put("approval", approval.id, approval);
              });
            }
          }
          approval.state = input.approve ? "approved" : "denied";
          store.put("approval", approval.id, approval);
          store.event("approval.resolved", `Proposal ${approval.state}.`);
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && path === "/api/settings") {
          const input = z
            .strictObject({
              provider: z.enum(["ollama", "compatible", "openai", "anthropic"]),
              model: z.string().trim().min(1).max(200),
              baseURL: z.string().url(),
              apiKey: z.string().max(1000).optional(),
              clearApiKey: z.boolean().optional(),
            })
            .parse(await body(req));
          const endpoint = new URL(input.baseURL);
          if (
            !["http:", "https:"].includes(endpoint.protocol) ||
            endpoint.username ||
            endpoint.password
          )
            fail(400, "Use an HTTP(S) endpoint without embedded credentials");
          if (
            endpoint.protocol === "http:" &&
            !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
          )
            fail(400, "Remote endpoints require HTTPS");
          if (active.size)
            fail(409, "Wait for running tasks before changing providers");
          let secret: string | null | undefined = undefined;
          if (input.clearApiKey) secret = null;
          if (input.apiKey) {
            const box = options.secretBox;
            if (!box)
              return fail(
                409,
                "This web runtime does not persist keys. Use the desktop app or environment variables.",
              );
            secret = await box.encrypt(input.apiKey);
          }
          const { provider, model, baseURL } = input;
          // A provider switch cannot silently send the previous provider's key to a new endpoint.
          if (
            secret === undefined &&
            (provider !== store.settings().provider ||
              baseURL !== store.settings().baseURL)
          )
            secret = null;
          store.saveSettings({ provider, model, baseURL }, secret);
          json(res, 200, store.settings());
          return;
        }
        if (req.method === "POST" && path === "/api/tasks/cancel") {
          const input = z.strictObject({ id: uuid }).parse(await body(req));
          const controller =
            active.get(input.id) ?? fail(409, "Task is not running");
          controller.abort();
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && path === "/api/chat") {
          const input = z
            .strictObject({
              botId: uuid,
              content: z.string().trim().min(1).max(20000),
              attachment: z
                .strictObject({
                  name: z.string().min(1).max(200),
                  text: z.string().min(1).max(200000),
                })
                .optional(),
            })
            .parse(await body(req));
          const b = bot(input.botId);
          if (
            store
              .all<Task>("task")
              .some((t) => t.botId === b.id && t.state === "running")
          )
            fail(409, "This bot already has a running task");
          if (!store.settings().model)
            fail(409, "Choose a model in Settings first");
          const task: Task = {
            id: randomUUID(),
            botId: b.id,
            state: "running",
            error: null,
            createdAt: new Date().toISOString(),
          };
          const content = input.attachment
            ? `${input.content}\n\nAttached document: ${input.attachment.name}\n<document>\n${input.attachment.text}\n</document>`
            : input.content;
          const user: Message = {
            id: randomUUID(),
            botId: b.id,
            role: "user",
            content,
            createdAt: task.createdAt,
            taskId: task.id,
          };
          store.transaction(() => {
            store.put("task", task.id, task);
            store.put("message", user.id, user);
            store.event("task.started", `Task started for ${b.name}.`);
          });
          const controller = new AbortController();
          active.set(task.id, controller);
          const assistant: Message = {
            id: randomUUID(),
            botId: b.id,
            role: "assistant",
            content: "",
            createdAt: task.createdAt,
            taskId: task.id,
          };
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store",
          });
          const send = (event: unknown) => {
            if (!res.destroyed) res.write(JSON.stringify(event) + "\n");
          };
          send({ type: "started", taskId: task.id });
          const timeout = setTimeout(() => controller.abort(), 180000);
          // Browser disconnect does not stop work; it remains visible after reload.
          try {
            const secret = store.secret(),
              apiKey =
                secret && options.secretBox
                  ? await options.secretBox.decrypt(secret)
                  : undefined;
            const skills = packages.active("skill").map((r) => ({
              id: r.manifest.id,
              name: r.manifest.name,
              description: r.manifest.description,
            }));
            const result = await (options.runner ?? runModel)(
              {
                settings: store.settings(),
                apiKey,
                bot: b,
                messages: store
                  .messages(b.id)
                  .slice(-40)
                  .map((m) => ({ role: m.role, content: m.content })),
                skills,
                // Progressive disclosure: full instructions and references load on demand,
                // and disabling a skill takes effect on the next call.
                loadSkill: (id) => {
                  const m = skillRelease(id).manifest as SkillManifest;
                  return {
                    instructions: m.instructions,
                    resources: (m.resources ?? [])
                      .filter((r) => r.kind === "reference")
                      .map((r) => r.path),
                  };
                },
                readSkillResource: (id, resourcePath) =>
                  packages.resourceText(skillRelease(id), resourcePath),
                connectorTools: connectorTools(b, task.id),
                signal: controller.signal,
                searchMemory: (q) => {
                  if (!bot(b.id).grantedCapabilities.includes("memory.read"))
                    fail(403, "Memory access revoked");
                  return store.searchMemory(b.id, q);
                },
                proposeMemory: (c) => {
                  if (!bot(b.id).grantedCapabilities.includes("memory.write"))
                    fail(403, "Memory access revoked");
                  return proposal(b.id, task.id, "memory", c);
                },
                proposeBot: (d) => {
                  if (b.template.id !== "socius/main")
                    fail(403, "Only Socius can create bot proposals");
                  return proposal(
                    b.id,
                    task.id,
                    "bot",
                    BotDraftSchema.parse(d),
                  );
                },
              },
              (text) => {
                assistant.content = text;
                store.put("message", assistant.id, assistant);
                send({ type: "text", content: text });
              },
            );
            if (controller.signal.aborted)
              throw new Error("Task cancelled or timed out");
            assistant.content = result;
            task.state = "completed";
            store.transaction(() => {
              store.put("message", assistant.id, assistant);
              store.put("task", task.id, task);
              store.event("task.completed", `Task completed for ${b.name}.`);
            });
            send({ type: "done", taskId: task.id });
          } catch {
            task.state = controller.signal.aborted ? "cancelled" : "failed";
            // Never return provider exception bodies, which can contain secrets or request context.
            task.error = controller.signal.aborted
              ? "Task cancelled or timed out."
              : "Model request failed. Check provider credentials, endpoint, model availability and tool support in Settings.";
            store.put("task", task.id, task);
            store.event(`task.${task.state}`, task.error);
            send({ type: "error", error: task.error });
          } finally {
            clearTimeout(timeout);
            active.delete(task.id);
            broker.forgetTask(task.id);
            res.end();
          }
          return;
        }
        return fail(404, "Endpoint not found");
      }
      if (req.method !== "GET") fail(405, "Method not allowed");
      const webDir = options.webDir;
      if (!webDir) return fail(404, "UI not built");
      const root = resolve(webDir),
        requested = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (requested !== root && !requested.startsWith(root + sep))
        fail(403, "Invalid path");
      let file = requested;
      try {
        if (!(await stat(file)).isFile()) file = resolve(root, "index.html");
      } catch {
        file = resolve(root, "index.html");
      }
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(await readFile(file));
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      json(
        res,
        error instanceof HttpError || error instanceof PackageError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
        {
          error:
            error instanceof HttpError || error instanceof PackageError
              ? error.message
              : error instanceof z.ZodError
                ? "Invalid request fields"
                : "Operation failed",
        },
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Runtime failed to bind");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    pairingURL: `${origin}/pair?token=${pairingToken}`,
    store,
    packages,
    connections,
    broker,
    close: async () => {
      for (const c of active.values()) c.abort();
      while (active.size) await new Promise((r) => setTimeout(r, 10));
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      store.close();
    },
  };
}
