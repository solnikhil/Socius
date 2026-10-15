// The browser's network boundary. Chromium sends every request, including
// redirects, subresources and WebSocket tunnels, through this local proxy. The
// proxy resolves the destination itself and connects only to public addresses,
// so DNS rebinding cannot reach the runtime, the LAN or the tailnet.
import {
  createServer,
  request as httpRequest,
  type Server,
} from "node:http";
import { connect, BlockList, isIP, type Socket } from "node:net";
import { lookup } from "node:dns/promises";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // Carrier-grade NAT, including Tailscale addresses.
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** True when `address` is loopback, private, link-local, tailnet or otherwise non-public. */
export function privateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blocked.check(address, "ipv4");
  if (version !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return blocked.check(mapped, "ipv4");
  return blocked.check(address, "ipv6");
}

const LOCAL_NAMES =
  /(^|\.)(localhost|local|internal|intranet|lan|home|corp|ts\.net|home\.arpa)$/i;

export class NavigationBlocked extends Error {}

/**
 * Checks a URL the agent asked for before any request is made. The proxy
 * repeats the address check for every request the page makes afterwards.
 */
export function checkUrl(raw: string, allowHosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NavigationBlocked("That is not a valid web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new NavigationBlocked("Only http and https pages can be opened.");
  if (url.username || url.password)
    throw new NavigationBlocked(
      "Addresses with embedded credentials are refused.",
    );
  if (allowHosts.has(url.host)) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    isIP(host)
      ? privateAddress(host)
      : LOCAL_NAMES.test(host) || !host.includes(".")
  )
    throw new NavigationBlocked(
      "Local, private-network and Socius addresses cannot be opened in the browser.",
    );
  return url;
}

export interface FilteringProxy {
  /** `http://127.0.0.1:port`, for Chromium's proxy setting. */
  server: string;
  /** Destinations refused so far, newest last (host only, for diagnostics). */
  refused: string[];
  close(): Promise<void>;
}

/**
 * Resolves `host` and returns one public address to connect to, or null when
 * the name is local or any resolved address is private.
 */
async function publicTarget(
  host: string,
  port: number,
  allowHosts: ReadonlySet<string>,
): Promise<string | null> {
  const bare = host.replace(/^\[|\]$/g, "");
  const key = `${isIP(bare) === 6 ? `[${bare}]` : bare}:${port}`;
  if (allowHosts.has(key) || allowHosts.has(bare)) return bare;
  if (port < 1 || port > 65535) return null;
  if (isIP(bare)) return privateAddress(bare) ? null : bare;
  if (LOCAL_NAMES.test(bare) || !bare.includes(".")) return null;
  try {
    const addresses = await lookup(bare, { all: true, verbatim: true });
    // Every answer must be public: a mixed answer is a rebinding attempt.
    if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
      return null;
    return addresses[0]!.address;
  } catch {
    return null;
  }
}

/**
 * Starts the proxy on loopback. It needs no credentials: it only reaches
 * public addresses, which any local process can reach anyway, and web pages
 * cannot send proxy requests. (A 407 challenge also made Playwright's
 * navigations occasionally stall.)
 */
export async function startFilteringProxy(
  allowHosts: ReadonlySet<string> = new Set(),
): Promise<FilteringProxy> {
  const refused: string[] = [];
  const refuse = (host: string) => {
    refused.push(host);
    if (refused.length > 50) refused.shift();
  };
  const sockets = new Set<Socket>();
  const server: Server = createServer(async (req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? "");
      if (target.protocol !== "http:") throw new Error();
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(target.port || 80);
    const address = await publicTarget(target.hostname, port, allowHosts);
    if (!address) {
      refuse(target.hostname);
      res.writeHead(403, {
        "Content-Type": "text/plain",
        "X-Socius-Blocked": "1",
      });
      res.end(
        "Blocked by Socius: local and private-network addresses are not reachable from the browser.",
      );
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    const upstream = httpRequest(
      {
        host: address,
        port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...headers, host: target.host },
        setHost: false,
        // One upstream connection per request: a reused keep-alive socket the
        // site is closing can stall the page's navigation.
        agent: false,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("connect", async (req, client: Socket, head: Buffer) => {
    client.on("error", () => client.destroy());
    const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url ?? "");
    const address = match
      ? await publicTarget(match[1]!, Number(match[2]), allowHosts)
      : null;
    if (!match || !address) {
      refuse(match?.[1] ?? "invalid");
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = connect(Number(match[2]), address, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.once("close", () => sockets.delete(upstream));
    upstream.on("error", () => client.destroy());
    client.once("close", () => upstream.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Browser proxy failed to bind");
  return {
    server: `http://127.0.0.1:${address.port}`,
    refused,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
