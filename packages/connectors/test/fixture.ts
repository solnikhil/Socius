// Test-only Notion-like MCP server with a minimal OAuth 2.1 authorization server
// (protected-resource metadata, dynamic client registration, PKCE and refresh).
// Production code never selects it; tests pass its URL as a connector endpoint override.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface FixturePage {
  id: string;
  title: string;
  content: string;
  parent: string | null;
}
export interface NotionFixture {
  url: string;
  pages: FixturePage[];
  calls: { tool: string; args: Record<string, unknown> }[];
  /** Behaviour of the next create-pages calls. */
  createMode: "ok" | "rate-limit" | "hang-after-create" | "reject";
  /** Drop a required tool input to simulate upstream schema drift. */
  driftSchema: boolean;
  revoked: string[];
  revokeAll(): void;
  close(): Promise<void>;
}

const read = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString();
};
const dashed = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export async function startNotionFixture(): Promise<NotionFixture> {
  const clients = new Map<string, string[]>();
  const codes = new Map<string, { challenge: string; clientId: string }>();
  const tokens = new Set<string>();
  const refresh = new Set<string>();
  const state: NotionFixture = {
    url: "",
    pages: [
      {
        id: dashed("1".repeat(32)),
        title: "Q3 planning",
        content: "Goals: ship connectors. Risk: OAuth review takes two weeks.",
        parent: null,
      },
    ],
    calls: [],
    createMode: "ok",
    driftSchema: false,
    revoked: [],
    revokeAll() {
      tokens.clear();
      refresh.clear();
    },
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  };
  const mcp = () => {
    const server = new McpServer({ name: "notion-fixture", version: "1.0.1" });
    const record = (tool: string, args: Record<string, unknown>) =>
      state.calls.push({ tool, args });
    server.registerTool(
      "notion-search",
      {
        description: "Search",
        inputSchema: (state.driftSchema
          ? { q: z.string() }
          : { query: z.string() }) as { query: z.ZodString },
      },
      async (args) => {
        record("notion-search", args);
        const query = String(
          (args as { query?: string }).query ?? "",
        ).toLowerCase();
        const hits = state.pages.filter((p) =>
          `${p.title} ${p.content}`.toLowerCase().includes(query),
        );
        return {
          content: [
            {
              type: "text",
              text:
                hits
                  .map(
                    (p) =>
                      `<page url="https://www.notion.so/${p.id.replaceAll("-", "")}">${p.title}</page>`,
                  )
                  .join("\n") || "No results",
            },
          ],
        };
      },
    );
    server.registerTool(
      "notion-fetch",
      { description: "Fetch", inputSchema: { id: z.string() } },
      async (args) => {
        record("notion-fetch", args);
        const page = state.pages.find((p) => p.id === args.id);
        if (!page)
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Not found" }],
          };
        const children = state.pages
          .filter((p) => p.parent === page.id)
          .map(
            (p) =>
              `<page url="https://www.notion.so/${p.id.replaceAll("-", "")}">${p.title}</page>`,
          );
        return {
          content: [
            {
              type: "text" as const,
              text: `# ${page.title}\n${page.content}\n${children.join("\n")}`,
            },
          ],
        };
      },
    );
    server.registerTool(
      "notion-create-pages",
      {
        description: "Create",
        inputSchema: {
          parent: z.object({ page_id: z.string() }),
          pages: z.array(
            z.object({
              properties: z.object({ title: z.string() }),
              content: z.string(),
            }),
          ),
        },
      },
      async (args) => {
        record("notion-create-pages", args);
        if (state.createMode === "reject")
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Parent not shared" }],
          };
        const page: FixturePage = {
          id: dashed(randomBytes(16).toString("hex")),
          title: args.pages[0]!.properties.title,
          content: args.pages[0]!.content,
          parent: args.parent.page_id,
        };
        state.pages.push(page);
        if (state.createMode === "hang-after-create")
          await new Promise((r) => setTimeout(r, 3000));
        return {
          content: [
            {
              type: "text" as const,
              text: `Created https://www.notion.so/${page.id.replaceAll("-", "")}`,
            },
          ],
        };
      },
    );
    return server;
  };
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", state.url);
    const send = (
      status: number,
      body: unknown,
      headers: Record<string, string> = {},
    ) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
      return send(200, {
        resource: `${state.url}/mcp`,
        authorization_servers: [state.url],
        scopes_supported: ["default"],
      });
    if (url.pathname === "/.well-known/oauth-authorization-server")
      return send(200, {
        issuer: state.url,
        authorization_endpoint: `${state.url}/authorize`,
        token_endpoint: `${state.url}/token`,
        registration_endpoint: `${state.url}/register`,
        revocation_endpoint: `${state.url}/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    if (url.pathname === "/register" && req.method === "POST") {
      const body = JSON.parse(await read(req));
      const clientId = `client-${randomBytes(6).toString("hex")}`;
      clients.set(clientId, body.redirect_uris);
      return send(201, { ...body, client_id: clientId });
    }
    if (url.pathname === "/authorize") {
      // Simulates the user approving access in their browser.
      const clientId = url.searchParams.get("client_id") ?? "";
      const redirect = url.searchParams.get("redirect_uri") ?? "";
      if (
        !clients.get(clientId)?.includes(redirect) ||
        url.searchParams.get("code_challenge_method") !== "S256"
      )
        return send(400, { error: "invalid_request" });
      const code = randomBytes(12).toString("hex");
      codes.set(code, {
        challenge: url.searchParams.get("code_challenge") ?? "",
        clientId,
      });
      const target = new URL(redirect);
      target.searchParams.set("code", code);
      target.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: target.href });
      return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const form = new URLSearchParams(await read(req));
      if (form.get("grant_type") === "authorization_code") {
        const grant = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        const challenge = createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (
          !grant ||
          grant.challenge !== challenge ||
          grant.clientId !== form.get("client_id")
        )
          return send(400, { error: "invalid_grant" });
      } else if (form.get("grant_type") === "refresh_token") {
        if (!refresh.has(form.get("refresh_token") ?? ""))
          return send(400, { error: "invalid_grant" });
      } else return send(400, { error: "unsupported_grant_type" });
      const access = randomBytes(16).toString("hex"),
        renew = randomBytes(16).toString("hex");
      tokens.add(access);
      refresh.add(renew);
      return send(200, {
        access_token: access,
        refresh_token: renew,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    if (url.pathname === "/revoke" && req.method === "POST") {
      const token = new URLSearchParams(await read(req)).get("token") ?? "";
      state.revoked.push(token);
      tokens.delete(token);
      refresh.delete(token);
      return send(200, {});
    }
    if (url.pathname === "/mcp") {
      const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (!tokens.has(token)) {
        res.writeHead(401, {
          "WWW-Authenticate": `Bearer resource_metadata="${state.url}/.well-known/oauth-protected-resource/mcp"`,
        });
        return res.end();
      }
      if (req.method === "POST" && state.createMode === "rate-limit") {
        const raw = await read(req);
        if (raw.includes("notion-create-pages")) {
          state.calls.push({ tool: "notion-create-pages", args: {} });
          res.writeHead(429, { "Retry-After": "30" });
          return res.end();
        }
        return handle(req, res, raw ? JSON.parse(raw) : undefined);
      }
      return handle(req, res);
    }
    send(404, { error: "not found" });
  });
  async function handle(
    req: IncomingMessage,
    res: import("node:http").ServerResponse,
    parsed?: unknown,
  ) {
    const transport = new StreamableHTTPServerTransport(
      {} as ConstructorParameters<typeof StreamableHTTPServerTransport>[0],
    );
    const server = mcp();
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport as Parameters<McpServer["connect"]>[0]);
    await transport.handleRequest(
      req,
      res,
      parsed ??
        (req.method === "POST" ? JSON.parse(await read(req)) : undefined),
    );
  }
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  state.url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return state;
}
