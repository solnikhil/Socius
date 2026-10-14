import { z } from "zod";
import type { ReviewedConnector } from "./index.js";
import { reviewedAction, query } from "./actions.js";
const owner = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/);
const repo = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/);
export const github: ReviewedConnector = {
  id: "socius/github",
  serverUrl: "https://api.githubcopilot.com/mcp/",
  accountLabel: "GitHub account",
  oauth: {
    scopes: ["repo"],
    clientIdEnv: "SOCIUS_GITHUB_CLIENT_ID",
    clientSecretEnv: "SOCIUS_GITHUB_CLIENT_SECRET",
  },
  requiredTools: {
    search_issues: ["query", "perPage"],
    issue_read: ["method", "owner", "repo", "issue_number"],
    issue_write: ["method", "owner", "repo", "title", "body"],
  },
  actions: [
    reviewedAction({
      id: "github.search",
      upstream: "search_issues",
      access: "read",
      capability: "documents.read",
      description: "Search GitHub issues visible to the connected user.",
      schema: z.strictObject({
        query,
        perPage: z.number().int().min(1).max(50).default(20),
      }),
      describe: ({ query }) => `Search GitHub issues for ${query}`,
    }),
    reviewedAction({
      id: "github.fetch",
      upstream: "issue_read",
      access: "read",
      capability: "documents.read",
      description: "Read one GitHub issue.",
      schema: z.strictObject({
        owner,
        repo,
        issue_number: z.number().int().positive(),
      }),
      arguments: (args) => ({ ...args, method: "get" }),
      describe: ({ owner, repo, issue_number }) =>
        `Read ${owner}/${repo}#${issue_number}`,
    }),
    reviewedAction({
      id: "github.create-issue",
      upstream: "issue_write",
      access: "write",
      capability: "documents.write",
      description:
        "Propose a new issue with exact repository, title and body approval.",
      schema: z.strictObject({
        owner,
        repo,
        title: z.string().trim().min(1).max(200),
        body: z.string().max(20000),
      }),
      arguments: (args) => ({ ...args, method: "create" }),
      describe: ({ owner, repo, title }) =>
        `Create issue “${title}” in ${owner}/${repo}`,
    }),
  ],
};
