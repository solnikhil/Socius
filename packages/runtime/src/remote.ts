import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { z } from "zod";
import type { Store } from "./store.js";
import { fail } from "./http.js";

export const RemoteSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  origin: z
    .string()
    .regex(
      /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ts\.net$/,
    ),
});
export interface RemoteSettings {
  enabled: boolean;
  origin: string;
  configuredPort?: number;
}
export const remoteSettings = (store: Store): RemoteSettings =>
  store.get<RemoteSettings>("remote-settings", "owner") ?? {
    enabled: false,
    origin: "",
  };
/** Host is authoritative. Forwarded metadata can agree with it but never select an origin or grant authority. */
export function requestOrigin(
  req: IncomingMessage,
  local: string,
  config: RemoteSettings,
) {
  const host = req.headers.host;
  const isLocal = host === new URL(local).host;
  const isRemote =
    config.enabled && config.origin && host === new URL(config.origin).host;
  if (!isLocal && !isRemote) return fail(403, "Invalid host");
  if (req.headers.forwarded || req.headers["tailscale-funnel-request"])
    fail(403, "Unsupported proxy request");
  for (const name of Object.keys(req.headers))
    if (name.startsWith("x-forwarded-")) {
      const value = req.headers[name];
      if (
        isLocal ||
        typeof value !== "string" ||
        (name === "x-forwarded-host"
          ? value !== host
          : name === "x-forwarded-proto"
            ? value !== "https"
            : name === "x-forwarded-for"
              ? !isIP(value)
              : true)
      )
        fail(403, "Invalid forwarded headers");
    }
  const origin = isLocal ? local : config.origin;
  if (req.headers.origin && req.headers.origin !== origin)
    fail(403, "Invalid origin");
  if (req.headers["sec-fetch-site"] === "cross-site")
    fail(403, "Cross-site request blocked");
  if (
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.headers.origin !== origin
  )
    fail(403, "Mutation requires the paired application origin");
  return { origin, kind: isLocal ? ("local" as const) : ("remote" as const) };
}
export function sessionCookie(token: string, remote: boolean) {
  return `${remote ? "__Host-socius_remote" : "socius_session"}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${remote ? "; Secure" : ""}`;
}
export function cookieToken(req: IncomingMessage, remote: boolean) {
  const key = remote ? "__Host-socius_remote=" : "socius_session=";
  return (
    (req.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(key))
      ?.slice(key.length) ?? ""
  );
}
/** An allowlist ensures new host integrations are local-only until deliberately reviewed. */
export function remoteSafe(method: string, path: string) {
  if (method === "GET")
    return (
      [
        "/api/state",
        "/api/messages",
        "/api/groups/messages",
        "/api/memory",
        "/api/devices",
        "/api/remote/status",
      ].includes(path) || /^\/api\/chats\/[^/]+$/.test(path)
    );
  return (
    method === "POST" &&
    [
      "/api/chat",
      "/api/groups/chat",
      "/api/tasks/cancel",
      "/api/approvals",
      "/api/actions/resolve",
      "/api/messages/react",
      "/api/bots/layout",
      "/api/models/select",
      "/api/devices/signout",
    ].includes(path)
  );
}
