import { z } from "zod";
import type { ReviewedConnector } from "./index.js";
import { reviewedAction, reference, query } from "./actions.js";
export const linear: ReviewedConnector = {
  id: "socius/linear",
  serverUrl: "https://mcp.linear.app/mcp",
  accountLabel: "Linear workspace",
  oauth: { scopes: ["read", "write"] },
  requiredTools: {
    list_issues: ["query", "limit"],
    get_issue: ["id"],
    save_issue: ["team", "title", "description"],
  },
  actions: [
    reviewedAction({
      id: "linear.search",
      upstream: "list_issues",
      access: "read",
      capability: "documents.read",
      description: "Search Linear issues as untrusted data.",
      schema: z.strictObject({
        query,
        limit: z.number().int().min(1).max(50).default(20),
      }),
      describe: ({ query }) => `Search Linear for ${query}`,
    }),
    reviewedAction({
      id: "linear.fetch",
      upstream: "get_issue",
      access: "read",
      capability: "documents.read",
      description: "Read one Linear issue by its identifier.",
      schema: z.strictObject({ id: reference }),
      describe: ({ id }) => `Read Linear issue ${id}`,
    }),
    reviewedAction({
      id: "linear.create-issue",
      upstream: "save_issue",
      access: "write",
      capability: "documents.write",
      description:
        "Propose one Linear issue. The exact team, title and description require approval.",
      schema: z.strictObject({
        team: reference,
        title: z.string().trim().min(1).max(200),
        description: z.string().max(20000),
      }),
      describe: ({ team, title }) =>
        `Create Linear issue “${title}” in ${team}`,
    }),
  ],
};
