import { createServer } from "node:http";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { z } from "zod";
import { Catalog, instantiateBot } from "@socius/marketplace";
import { curatedCatalog } from "@socius/marketplace/curated";
import type { BotInstance, BotManifest, Manifest } from "@socius/contracts";
import type {
  Approval,
  BotDraft,
  Installation,
  Message,
  Task,
} from "@socius/contracts/app";
import type { ModelRef } from "@socius/contracts/providers";
import { Store } from "./store.js";
import { runModel, type ModelRequest, type ModelRunner } from "./model.js";
import { body, errorResponse, fail, json } from "./http.js";
import {
  CreateConnection,
  ModelId,
  ProviderService,
  UpdateConnection,
  type SecretBox,
} from "./providers/service.js";
import { classify, ProviderFailure } from "./providers/errors.js";

export type { SecretBox };
export interface RuntimeOptions {
  dataDir: string;
  webDir?: string;
  port?: number;
  secretBox?: SecretBox;
  runner?: ModelRunner;
  /** Network transport for provider calls. Tests inject a controlled fetch. */
  fetch?: typeof globalThis.fetch;
  /** Environment used for provider credential fallbacks. */
  env?: NodeJS.ProcessEnv;
}
const BotDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(8000),
});
const uuid = z.string().uuid();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function startRuntime(options: RuntimeOptions) {
  const store = new Store(options.dataDir),
    catalog = new Catalog(curatedCatalog);
  let pairingToken = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  // Running task id → its controller and the provider connection it uses.
  const active = new Map<
    string,
    { controller: AbortController; connectionId: string }
  >();
  const providers = new ProviderService(
    store,
    options.secretBox,
    options.fetch,
    (connectionId) =>
      [...active.values()].some((t) => t.connectionId === connectionId),
    options.env ?? process.env,
  );
  const ModelRefSchema = z.strictObject({
    connectionId: uuid,
    modelId: ModelId,
  });
  let origin = "";
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
            catalog: catalog.list(),
            installations: store.all("installation"),
            activity: store.all("activity").slice(-100).reverse(),
            approvals: store.all("approval"),
            tasks: store.all("task"),
            connections: providers.list(),
            models: store.providers.models(),
            selection: store.providers.selection(),
            environment: providers.environment(),
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
            .strictObject({ botId: uuid, memory: z.boolean() })
            .parse(await body(req));
          const b = bot(input.botId);
          b.grantedCapabilities = input.memory
            ? ["memory.read", "memory.write"]
            : [];
          store.put("bot", b.id, b);
          store.event(
            "permissions.updated",
            `Memory access ${input.memory ? "enabled" : "revoked"} for ${b.name}.`,
          );
          json(res, 200, b);
          return;
        }
        if (req.method === "POST" && path === "/api/install/preview") {
          const input = z
            .strictObject({ id: z.string(), version: z.string() })
            .parse(await body(req));
          const plan = catalog.planInstall(input.id, input.version);
          json(res, 200, { ...plan, digest: digest(plan.packages) });
          return;
        }
        if (req.method === "POST" && path === "/api/install") {
          const input = z
            .strictObject({
              id: z.string(),
              version: z.string(),
              digest: z.string().length(64),
            })
            .parse(await body(req));
          const plan = catalog.planInstall(input.id, input.version);
          if (!same(digest(plan.packages), input.digest))
            fail(409, "The installation plan changed. Review it again.");
          if (plan.packages.some((p) => p.kind === "connector"))
            fail(
              409,
              "Connector execution and authentication are not implemented yet",
            );
          const root = plan.packages.find((p) => p.id === input.id)!;
          store.transaction(() => {
            for (const p of plan.packages) {
              const receipt: Installation = {
                id: p.id,
                version: p.version,
                digest: digest(p),
                installedAt: new Date().toISOString(),
              };
              store.put("installation", p.id, receipt);
            }
            if (root.kind === "bot")
              createBot(
                {
                  name: root.name,
                  role: root.role,
                  instructions: root.instructions,
                },
                root,
              );
            store.event(
              "package.installed",
              `Installed ${root.name} ${root.version}. No permissions were granted.`,
            );
          });
          json(res, 200, { ok: true });
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
        if (req.method === "POST" && path === "/api/providers") {
          json(
            res,
            201,
            await providers.create(CreateConnection.parse(await body(req))),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/providers/update") {
          json(
            res,
            200,
            await providers.update(UpdateConnection.parse(await body(req))),
          );
          return;
        }
        if (req.method === "DELETE" && path === "/api/providers") {
          const input = z.strictObject({ id: uuid }).parse(await body(req));
          providers.remove(input.id);
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && path === "/api/providers/test") {
          const input = z
            .strictObject({ id: uuid, modelId: ModelId.optional() })
            .parse(await body(req));
          json(
            res,
            200,
            await providers.testConnection(input.id, input.modelId),
          );
          return;
        }
        if (req.method === "GET" && path === "/api/providers/models") {
          json(
            res,
            200,
            await providers.discover(
              url.searchParams.get("id") ?? "",
              url.searchParams.get("refresh") === "1",
            ),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/models") {
          const input = ModelRefSchema.extend({
            label: z.string().trim().max(120).optional(),
          }).parse(await body(req));
          json(res, 201, providers.addModel(input, input.label));
          return;
        }
        if (req.method === "DELETE" && path === "/api/models") {
          providers.removeModel(ModelRefSchema.parse(await body(req)));
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && path === "/api/models/test") {
          json(
            res,
            200,
            await providers.testModel(ModelRefSchema.parse(await body(req))),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/models/select") {
          const input = z
            .strictObject({
              botId: uuid.nullable(),
              model: ModelRefSchema.nullable(),
            })
            .parse(await body(req));
          if (input.botId) bot(input.botId);
          const ref: ModelRef | null = input.model
            ? providers.entry(input.model)
            : null;
          store.providers.select(
            input.botId ? `bot:${input.botId}` : "default",
            ref && { connectionId: ref.connectionId, modelId: ref.modelId },
          );
          store.event(
            "model.selected",
            ref
              ? `${input.botId ? `${bot(input.botId).name} now uses` : "Default model set to"} ${ref.modelId}.`
              : input.botId
                ? `${bot(input.botId).name} now uses the default model.`
                : "Default model cleared.",
          );
          json(res, 200, store.providers.selection());
          return;
        }
        if (req.method === "POST" && path === "/api/tasks/cancel") {
          const input = z.strictObject({ id: uuid }).parse(await body(req));
          const running =
            active.get(input.id) ?? fail(409, "Task is not running");
          running.controller.abort();
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
          // Resolve the model before recording anything, so setup errors are immediate.
          const selected = await providers.forChat(b.id);
          const task: Task = {
            id: randomUUID(),
            botId: b.id,
            state: "running",
            error: null,
            model: selected.ref,
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
          active.set(task.id, {
            controller,
            connectionId: selected.ref.connectionId,
          });
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
          let timedOut = false;
          const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, 180000);
          // Browser disconnect does not stop work; it remains visible after reload.
          try {
            const installations = store.all<Installation>("installation");
            const skills = catalog
              .list()
              .filter(
                (p): p is Extract<Manifest, { kind: "skill" }> =>
                  p.kind === "skill" &&
                  installations.some(
                    (i) => i.id === p.id && i.version === p.version,
                  ),
              )
              .map((p) => p.instructions);
            let streamed = false;
            const request: ModelRequest = {
              model: selected.model,
              modelRef: selected.ref,
              tools: selected.entry.tools !== false,
              bot: b,
              messages: store
                .messages(b.id)
                .slice(-40)
                .map((m) => ({ role: m.role, content: m.content })),
              skills,
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
                return proposal(b.id, task.id, "bot", BotDraftSchema.parse(d));
              },
            };
            const onText = (text: string) => {
              streamed = true;
              assistant.content = text;
              store.put("message", assistant.id, assistant);
              send({ type: "text", content: text });
            };
            const runner = options.runner ?? runModel;
            let result: string;
            try {
              result = await runner(request, onText);
            } catch (error) {
              const failure = classify(error, selected.providerName);
              // A model that rejects tools fails before producing output, so
              // retrying once without tools cannot repeat any side effect.
              if (
                failure.code !== "tools_unsupported" ||
                !request.tools ||
                streamed ||
                controller.signal.aborted
              )
                throw failure;
              store.providers.setModelTools(selected.ref, false);
              result = await runner({ ...request, tools: false }, onText);
            }
            if (controller.signal.aborted)
              throw new ProviderFailure("cancelled", "Task cancelled.");
            assistant.content = result;
            task.state = "completed";
            store.transaction(() => {
              store.put("message", assistant.id, assistant);
              store.put("task", task.id, task);
              store.event("task.completed", `Task completed for ${b.name}.`);
            });
            send({ type: "done", taskId: task.id });
          } catch (error) {
            // Never return provider exception bodies, which can contain secrets or request context.
            const failure = classify(error, selected.providerName, {
              aborted: controller.signal.aborted,
              timedOut,
            });
            task.state = failure.code === "cancelled" ? "cancelled" : "failed";
            task.error = failure.message;
            task.errorCode = failure.code;
            store.put("task", task.id, task);
            store.event(`task.${task.state}`, task.error);
            send({ type: "error", error: task.error, code: failure.code });
          } finally {
            clearTimeout(timeout);
            active.delete(task.id);
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
      errorResponse(res, error);
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
    close: async () => {
      for (const t of active.values()) t.controller.abort();
      while (active.size) await new Promise((r) => setTimeout(r, 10));
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      store.close();
    },
  };
}
