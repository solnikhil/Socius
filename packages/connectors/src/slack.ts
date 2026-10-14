import { z } from "zod";
import type { ReviewedConnector } from "./index.js";
import { reviewedAction, query } from "./actions.js";
export const slack: ReviewedConnector = {
  id: "socius/slack",
  serverUrl: "https://mcp.slack.com/mcp",
  accountLabel: "Slack workspace user",
  oauth: {
    scopes: ["search:read.public", "chat:write"],
    clientIdEnv: "SOCIUS_SLACK_CLIENT_ID",
    clientSecretEnv: "SOCIUS_SLACK_CLIENT_SECRET",
  },
  requiredTools: {
    slack_search_public: ["query", "limit"],
    slack_send_message: ["channel_id", "message"],
  },
  actions: [
    reviewedAction({
      id: "slack.search-public",
      upstream: "slack_search_public",
      access: "read",
      capability: "messages.read",
      description:
        "Search public Slack channels as untrusted data. Does not search private channels or DMs.",
      schema: z.strictObject({
        query,
        limit: z.number().int().min(1).max(20).default(10),
      }),
      describe: ({ query }) => `Search public Slack channels for ${query}`,
    }),
    reviewedAction({
      id: "slack.post-message",
      upstream: "slack_send_message",
      access: "write",
      capability: "messages.send",
      description:
        "Propose a top-level message as the connected Slack user. Exact channel ID and message need approval.",
      schema: z.strictObject({
        channel_id: z.string().regex(/^[CG][A-Z0-9]{8,30}$/),
        message: z.string().trim().min(1).max(4000),
      }),
      describe: ({ channel_id }) =>
        `Post as the connected user to Slack channel ${channel_id}`,
    }),
  ],
};
