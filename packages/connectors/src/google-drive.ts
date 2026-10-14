import { z } from "zod";
import type { ReviewedConnector } from "./index.js";
import { reviewedAction, query } from "./actions.js";
const fileId = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);
export const googleDrive: ReviewedConnector = {
  id: "socius/google-drive",
  serverUrl: "https://drivemcp.googleapis.com/mcp/v1",
  accountLabel: "Google Drive account",
  oauth: {
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
    clientIdEnv: "SOCIUS_DRIVE_CLIENT_ID",
    clientSecretEnv: "SOCIUS_DRIVE_CLIENT_SECRET",
    authorizationParams: { access_type: "offline", prompt: "consent" },
  },
  requiredTools: {
    search_files: ["query", "pageSize"],
    read_file_content: ["fileId", "includeComments"],
    create_file: [
      "title",
      "parentId",
      "textContent",
      "contentMimeType",
      "disableConversionToGoogleType",
    ],
  },
  actions: [
    reviewedAction({
      id: "drive.search",
      upstream: "search_files",
      access: "read",
      capability: "documents.read",
      description:
        "Search eligible Drive files with the provider's structured query syntax.",
      schema: z.strictObject({
        query,
        pageSize: z.number().int().min(1).max(50).default(20),
      }),
      describe: ({ query }) => `Search Google Drive for ${query}`,
    }),
    reviewedAction({
      id: "drive.fetch",
      upstream: "read_file_content",
      access: "read",
      capability: "documents.read",
      description:
        "Read the text representation of one eligible Drive file, without comments.",
      schema: z.strictObject({ fileId }),
      arguments: (args) => ({ ...args, includeComments: false }),
      describe: ({ fileId }) => `Read Google Drive file ${fileId}`,
    }),
    reviewedAction({
      id: "drive.create-document",
      upstream: "create_file",
      access: "write",
      capability: "documents.write",
      description:
        "Propose a new text document in an explicit Drive parent folder. Folder permissions may be inherited. Exact folder, title and content need approval.",
      schema: z.strictObject({
        parentId: fileId,
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(/^[^\p{Cc}/\\]*$/u),
        textContent: z.string().max(20000),
      }),
      arguments: (args) => ({
        ...args,
        contentMimeType: "text/plain",
        disableConversionToGoogleType: false,
      }),
      describe: ({ parentId, title }) =>
        `Create Drive document “${title}” in folder ${parentId} (inherits folder access)`,
    }),
  ],
};
