import { z } from "zod";
import type { Capability } from "@socius/contracts";
import type { ConnectorAction } from "./index.js";
import { ConnectorError } from "./mcp.js";
/** First-party, explicitly reviewed tool mapping. Never accepts an upstream tool name from a model. */
export function reviewedAction<A extends Record<string, unknown>>(options: {
  id: string;
  upstream: string;
  access: "read" | "write";
  capability: Capability;
  description: string;
  schema: z.ZodType<A>;
  describe: (args: A) => string;
  arguments?: (args: A) => Record<string, unknown>;
}): ConnectorAction {
  return {
    id: options.id,
    access: options.access,
    capability: options.capability,
    toolName: options.id.replaceAll(".", "_").replaceAll("-", "_"),
    description: options.description,
    input: options.schema as z.ZodType<Record<string, unknown>>,
    params: options.schema as z.ZodType<Record<string, unknown>>,
    describe: (args) => options.describe(args as A),
    async execute(client, args) {
      const result = await client.callTool(
        options.upstream,
        options.arguments ? options.arguments(args as A) : args,
      );
      if (result.isError)
        throw new ConnectorError("rejected", refusal(result.text));
      // Remote text is data; limit what enters chat. Writes without provider-supported
      // reconciliation remain unknown after ambiguous outcomes and are never auto-replayed.
      return {
        summary:
          options.access === "read"
            ? "Retrieved connected-app data."
            : "The service confirmed the approved change.",
        data:
          result.text.slice(0, 12000) +
          (result.text.length > 12000 ? "\n[truncated]" : ""),
      };
    },
  };
}
/**
 * The service's own reason for refusing, so the user can see why. It is
 * remote text: control characters are stripped and it is clipped, and the
 * interface renders it as plain text.
 */
export function refusal(text: string): string {
  const reason = text
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!reason) return "The service rejected this reviewed action.";
  return `The service refused: ${reason.length > 300 ? `${reason.slice(0, 300)}…` : reason}`;
}
export const reference = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^[^\p{Cc}]*$/u);
export const query = z.string().trim().min(1).max(500);
