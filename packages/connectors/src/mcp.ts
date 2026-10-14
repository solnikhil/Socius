import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  UnauthorizedError,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export interface ToolInfo {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}
export interface ToolResult {
  text: string;
  isError: boolean;
}
/** The narrow surface reviewed connector actions may use. */
export interface McpToolClient {
  listTools(): Promise<ToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close(): Promise<void>;
}

/**
 * How a failed call relates to the remote effect.
 * - auth: credentials missing/rejected; the request was not performed.
 * - rate-limited / rejected: the server refused the request; nothing happened.
 * - ambiguous: timeout, disconnect or server error; the effect may or may not exist.
 */
export type FailureKind = "auth" | "rate-limited" | "rejected" | "ambiguous";
export class ConnectorError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
  }
}

export function classifyError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  if (error instanceof UnauthorizedError)
    return new ConnectorError(
      "auth",
      "The connected account needs to sign in again.",
    );
  if (error instanceof StreamableHTTPError) {
    const code = error.code ?? 0;
    if (code === 401 || code === 403)
      return new ConnectorError(
        "auth",
        "The connected account needs to sign in again.",
      );
    if (code === 429)
      return new ConnectorError(
        "rate-limited",
        "The service rate limit was reached. Try again later.",
      );
    if (code >= 400 && code < 500)
      return new ConnectorError(
        "rejected",
        `The service rejected the request (HTTP ${code}).`,
      );
    return new ConnectorError(
      "ambiguous",
      "The service returned an error before confirming the outcome.",
    );
  }
  if (error instanceof McpError) {
    if (
      error.code === ErrorCode.RequestTimeout ||
      error.code === ErrorCode.ConnectionClosed
    )
      return new ConnectorError(
        "ambiguous",
        "The request timed out before the service confirmed the outcome.",
      );
    return new ConnectorError("rejected", "The service rejected the request.");
  }
  return new ConnectorError(
    "ambiguous",
    "The connection failed before the service confirmed the outcome.",
  );
}

export interface McpClientOptions {
  url: URL;
  authProvider?: OAuthClientProvider;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
/** Connects to a reviewed streamable-HTTP MCP endpoint. Never launches processes. */
export async function connectMcp(
  options: McpClientOptions,
): Promise<McpToolClient> {
  const transport = new StreamableHTTPClientTransport(options.url, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const client = new Client({ name: "socius", version: "0.1.0" });
  const timeout = options.timeoutMs ?? 30_000;
  try {
    // The SDK transport types sessionId as optional; exactOptionalPropertyTypes needs a cast.
    await client.connect(transport as Parameters<Client["connect"]>[0], {
      timeout,
    });
  } catch (error) {
    await client.close().catch(() => undefined);
    throw classifyError(error);
  }
  return {
    async listTools() {
      try {
        const tools: ToolInfo[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 10; page++) {
          const result = await client.listTools(cursor ? { cursor } : {}, {
            timeout,
          });
          tools.push(...(result.tools as ToolInfo[]));
          cursor = result.nextCursor;
          if (!cursor) break;
        }
        return tools;
      } catch (error) {
        throw classifyError(error);
      }
    },
    async callTool(name, args) {
      try {
        const result = await client.callTool(
          { name, arguments: args },
          undefined,
          {
            timeout,
            maxTotalTimeout: timeout,
          },
        );
        const content = Array.isArray(result.content) ? result.content : [];
        return {
          text: content
            .filter(
              (c): c is { type: "text"; text: string } => c?.type === "text",
            )
            .map((c) => c.text)
            .join("\n"),
          isError: result.isError === true,
        };
      } catch (error) {
        throw classifyError(error);
      }
    },
    close: () => client.close(),
  };
}
