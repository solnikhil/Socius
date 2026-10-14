import type { ConnectorManifest } from "@socius/contracts";
export function productivityConnector(
  id: string,
  name: string,
  url: string,
  setup: string,
  tools: NonNullable<ConnectorManifest["tools"]>,
): ConnectorManifest {
  return {
    schemaVersion: 1,
    id: `socius/${id}`,
    version: "0.1.0",
    kind: "connector",
    name,
    publisher: "Socius",
    license: "LicenseRef-Socius-Pending",
    description: `${name}: reviewed reads and exact-approval changes. Account setup is required.`,
    capabilities: [...new Set(tools.map((t) => t.capability))],
    dependencies: [],
    protocol: "mcp",
    transport: "streamable-http",
    authentication: "oauth",
    setup: `${setup} Endpoint: ${url}. Grant each bot access to this connector separately. Every write requires exact approval; ambiguous writes are not automatically replayed.`,
    tools,
  };
}
export const linearManifest = productivityConnector(
  "linear",
  "Linear",
  "https://mcp.linear.app/mcp",
  "Sign in to Linear using OAuth/PKCE.",
  [
    {
      id: "linear.search",
      access: "read",
      capability: "documents.read",
      description: "Search issues.",
    },
    {
      id: "linear.fetch",
      access: "read",
      capability: "documents.read",
      description: "Read an issue.",
    },
    {
      id: "linear.create-issue",
      access: "write",
      capability: "documents.write",
      description: "Create one issue after approval.",
    },
  ],
);
