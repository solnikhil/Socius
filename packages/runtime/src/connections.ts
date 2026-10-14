import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  auth,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  checkToolSchemas,
  classifyError,
  connectMcp,
  ConnectorError,
  reviewedConnector,
  type McpToolClient,
  type ReviewedConnector,
} from "@socius/connectors";
import type { ConnectorConnection } from "@socius/contracts/app";
import type { Store } from "./store.js";
import { PackageError } from "./packages.js";

export interface SecretBox {
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
}
export interface ConnectionOptions {
  secretBox?: SecretBox | undefined;
  /** Test-only endpoint overrides for fixture servers. */
  endpoints?: Record<string, string> | undefined;
  fetch?: typeof fetch | undefined;
  /** Opens the provider's sign-in page in the system browser, outside chat. */
  openExternal?: ((url: string) => void) | undefined;
  timeoutMs?: number | undefined;
  env?: NodeJS.ProcessEnv;
  /** Registered-client callbacks use a stable, loopback-only listener. */
  callbackPort?: number;
}
interface SecretState {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
}
const FLOW_TTL = 10 * 60 * 1000;
/** Opening the session failed, so no request reached the service. */
export class OpenError extends Error {
  constructor(readonly failure: ConnectorError) {
    super(failure.message);
  }
}
const fail = (status: number, message: string): never => {
  throw new PackageError(status, message);
};

class StoredOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly secrets: SecretState,
    private readonly persist: (state: SecretState) => Promise<void>,
    private readonly redirect: string,
    private readonly flow?: string,
    private readonly onRedirect?: (url: URL) => void,
    private readonly settings?: {
      scopes: string[];
      client?: OAuthClientInformationMixed;
      authorizationParams?: Record<string, string>;
    },
  ) {}
  get redirectUrl() {
    return this.redirect;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Socius",
      redirect_uris: [this.redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method:
        this.settings?.client && "client_secret" in this.settings.client
          ? "client_secret_post"
          : "none",
      ...(this.settings?.scopes.length
        ? { scope: this.settings.scopes.join(" ") }
        : {}),
    };
  }
  state() {
    return this.flow ?? randomBytes(24).toString("base64url");
  }
  clientInformation() {
    const info = this.secrets.clientInformation as
      (OAuthClientInformationMixed & { redirect_uris?: string[] }) | undefined;
    // The desktop runtime uses an ephemeral port; a new sign-in re-registers for it.
    if (
      this.flow &&
      info?.redirect_uris &&
      !info.redirect_uris.includes(this.redirect)
    )
      return undefined;
    return info ?? this.settings?.client;
  }
  async saveClientInformation(info: OAuthClientInformationMixed) {
    this.secrets.clientInformation = info;
    await this.persist(this.secrets);
  }
  tokens() {
    return this.secrets.tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    this.secrets.tokens = tokens;
    await this.persist(this.secrets);
  }
  redirectToAuthorization(url: URL) {
    // Outside an explicit sign-in, never start one implicitly from a bot action.
    if (!this.onRedirect)
      throw new ConnectorError(
        "auth",
        "The connected account needs to sign in again.",
      );
    for (const [key, value] of Object.entries(
      this.settings?.authorizationParams ?? {},
    ))
      url.searchParams.set(key, value);
    this.onRedirect(url);
  }
  async saveCodeVerifier(verifier: string) {
    this.secrets.codeVerifier = verifier;
    await this.persist(this.secrets);
  }
  codeVerifier() {
    if (!this.secrets.codeVerifier)
      throw new ConnectorError("auth", "Sign-in expired; start again.");
    return this.secrets.codeVerifier;
  }
  async saveDiscoveryState(state: OAuthDiscoveryState) {
    this.secrets.discoveryState = state;
    await this.persist(this.secrets);
  }
  discoveryState() {
    return this.secrets.discoveryState;
  }
  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ) {
    if (scope === "all" || scope === "client")
      delete this.secrets.clientInformation;
    if (scope === "all" || scope === "tokens") delete this.secrets.tokens;
    if (scope === "all" || scope === "verifier")
      delete this.secrets.codeVerifier;
    if (scope === "all" || scope === "discovery")
      delete this.secrets.discoveryState;
    await this.persist(this.secrets);
  }
}

export class ConnectionService {
  private readonly flows = new Map<
    string,
    { connectionId: string; expiresAt: number }
  >();
  private readonly connecting = new Set<string>();
  private callbackStarting: Promise<void> | undefined;
  private callbackServer: Server | undefined;
  private callbackOrigin: string | undefined;
  private readonly locks = new Map<string, Promise<void>>();
  constructor(
    private readonly store: Store,
    private readonly options: ConnectionOptions,
    private readonly origin: () => string,
  ) {}
  get secureStorage() {
    return !!this.options.secretBox;
  }
  list() {
    return this.store.all<ConnectorConnection>("connection");
  }
  get(id: string) {
    return this.store.get<ConnectorConnection>("connection", id);
  }
  /** The current connection for a connector. Revoked connections are history. */
  forConnector(connectorId: string) {
    return this.list()
      .filter(
        (c) => c.connectorId === connectorId && c.state !== "disconnected",
      )
      .at(-1);
  }
  private connector(id: string): ReviewedConnector {
    return reviewedConnector(id) ?? fail(404, "Unknown connector");
  }
  private serverUrl(connector: ReviewedConnector) {
    return new URL(
      this.options.endpoints?.[connector.id] ?? connector.serverUrl,
    );
  }
  private redirect(connector?: ReviewedConnector) {
    return `${connector?.oauth?.clientIdEnv ? this.callbackOrigin : this.origin()}/oauth/callback`;
  }
  private oauthSettings(
    connector: ReviewedConnector,
  ):
    | {
        scopes: string[];
        client?: OAuthClientInformationMixed;
        authorizationParams?: Record<string, string>;
      }
    | undefined {
    const env = this.options.env ?? process.env;
    const config = connector.oauth;
    if (!config) return undefined;
    if (!config.clientIdEnv) return { scopes: config.scopes };
    const clientId = env[config.clientIdEnv];
    const clientSecret = config.clientSecretEnv && env[config.clientSecretEnv];
    if (!clientId || (config.clientSecretEnv && !clientSecret))
      return fail(
        409,
        `Configure ${config.clientIdEnv}${config.clientSecretEnv ? ` and ${config.clientSecretEnv}` : ""} on the host before connecting.`,
      );
    return {
      scopes: config.scopes,
      client: {
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      },
      ...(config.authorizationParams
        ? { authorizationParams: config.authorizationParams }
        : {}),
    };
  }
  private async ensureCallback() {
    if (this.callbackServer) return;
    if (this.callbackStarting) return this.callbackStarting;
    this.callbackStarting = this.startCallback().finally(() => {
      this.callbackStarting = undefined;
    });
    return this.callbackStarting;
  }
  private async startCallback() {
    const server = createServer(async (req, res) => {
      const host = new URL(this.callbackOrigin!).host;
      if (
        req.headers.host !== host ||
        req.method !== "GET" ||
        !req.url?.startsWith("/oauth/callback?")
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      let result;
      try {
        result = await this.callback(
          new URL(req.url, this.callbackOrigin).searchParams,
        );
      } catch {
        result = {
          ok: false,
          message: "Sign-in could not finish. Return to Socius and reconnect.",
        };
      }
      res.writeHead(result.ok ? 200 : 400, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      res.end(result.message);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.options.callbackPort ?? 37377, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Callback listener unavailable");
    }
    this.callbackOrigin = `http://127.0.0.1:${address.port}`;
    this.callbackServer = server;
  }
  async close() {
    if (this.callbackServer)
      await new Promise<void>((resolve) =>
        this.callbackServer!.close(() => resolve()),
      );
  }
  private update(
    connection: ConnectorConnection,
    patch: Partial<ConnectorConnection>,
  ) {
    Object.assign(connection, patch, { updatedAt: new Date().toISOString() });
    this.store.put("connection", connection.id, connection);
    return connection;
  }
  private async load(connectionId: string): Promise<SecretState> {
    const sealed = this.store.connectionSecret(connectionId);
    if (!sealed) return {};
    const box =
      this.options.secretBox ??
      fail(409, "Secure credential storage is unavailable");
    try {
      return JSON.parse(await box.decrypt(sealed)) as SecretState;
    } catch {
      // Never fall back to empty state: a later save would overwrite the real tokens.
      throw new ConnectorError(
        "rejected",
        "Socius could not unlock the stored credentials. Try again; disconnect and reconnect if this keeps happening.",
      );
    }
  }
  private persister(connectionId: string) {
    return async (state: SecretState) => {
      const box =
        this.options.secretBox ??
        fail(409, "Secure credential storage is unavailable");
      const encrypted = await box.encrypt(JSON.stringify(state));
      if (
        !this.get(connectionId) ||
        this.get(connectionId)?.state === "disconnected"
      )
        throw new ConnectorError("auth", "This connection was revoked.");
      this.store.saveConnectionSecret(connectionId, encrypted);
    };
  }

  async connect(connectorId: string) {
    if (this.connecting.has(connectorId))
      return fail(409, "Sign-in is already starting for this connector");
    this.connecting.add(connectorId);
    try {
      return await this.beginConnect(connectorId);
    } finally {
      this.connecting.delete(connectorId);
    }
  }
  private async beginConnect(connectorId: string) {
    const connector = this.connector(connectorId);
    const oauth = this.oauthSettings(connector);
    if (connector.oauth?.clientIdEnv) await this.ensureCallback();
    for (const [id, flow] of this.flows)
      if (flow.expiresAt < Date.now()) this.flows.delete(id);
    if (!this.options.secretBox)
      fail(
        409,
        "Connecting accounts needs OS-backed credential encryption. Use the desktop app.",
      );
    const now = new Date().toISOString();
    const connection =
      this.forConnector(connectorId) ??
      this.update(
        {
          id: randomUUID(),
          connectorId,
          state: "authentication-required",
          accountLabel: connector.accountLabel ?? "Connected workspace",
          detail: "",
          createdAt: now,
          updatedAt: now,
        },
        {},
      );
    // A new sign-in replaces earlier tokens; unreadable state is discarded, not reused.
    const state = await this.load(connection.id).catch(
      () => ({}) as SecretState,
    );
    delete state.tokens;
    for (const [id, previous] of this.flows)
      if (previous.connectionId === connection.id) this.flows.delete(id);
    const flow = randomBytes(24).toString("base64url");
    let authorizationUrl: URL | undefined;
    const provider = new StoredOAuthProvider(
      state,
      this.persister(connection.id),
      this.redirect(connector),
      flow,
      (url) => {
        authorizationUrl = url;
      },
      oauth,
    );
    try {
      await auth(provider, {
        serverUrl: this.serverUrl(connector),
        ...(connector.oauth ? { scope: connector.oauth.scopes.join(" ") } : {}),
        ...(this.options.fetch ? { fetchFn: this.options.fetch } : {}),
      });
    } catch {
      this.update(connection, {
        state: "failed",
        detail:
          "Could not start sign-in. Check your internet connection and try again.",
      });
      return fail(502, "Could not start sign-in with the service");
    }
    if (!authorizationUrl)
      fail(502, "The service did not provide a sign-in page");
    const allowed =
      authorizationUrl!.protocol === "https:" ||
      (!!this.options.endpoints && authorizationUrl!.hostname === "127.0.0.1");
    if (!allowed) fail(502, "The service returned an insecure sign-in address");
    this.flows.set(flow, {
      connectionId: connection.id,
      expiresAt: Date.now() + FLOW_TTL,
    });
    this.update(connection, {
      state: "authentication-required",
      detail: "Finish signing in through your browser.",
    });
    this.store.event(
      "connector.sign-in",
      `Sign-in to ${connectorId} started in the browser.`,
    );
    this.options.openExternal?.(authorizationUrl!.href);
    return {
      connection,
      authorizationUrl: authorizationUrl!.href,
      opened: !!this.options.openExternal,
    };
  }

  /** Completes an OAuth redirect. The one-time state binds it to a sign-in we started. */
  async callback(
    params: URLSearchParams,
  ): Promise<{ ok: boolean; message: string }> {
    const flowId = params.get("state") ?? "";
    const flow = this.flows.get(flowId);
    if (!flow || flow.expiresAt < Date.now())
      return {
        ok: false,
        message:
          "This sign-in link is invalid or expired. Start again in Socius.",
      };
    this.flows.delete(flowId);
    const connection = this.get(flow.connectionId);
    if (!connection || connection.state === "disconnected")
      return { ok: false, message: "This connection no longer exists." };
    const code = params.get("code");
    if (!code || params.get("error")) {
      this.update(connection, {
        state: "authentication-required",
        detail: "Sign-in was cancelled or denied. Nothing was connected.",
      });
      return {
        ok: false,
        message: "Sign-in was cancelled. You can close this tab.",
      };
    }
    const connector = this.connector(connection.connectorId);
    if (connector.oauth?.clientIdEnv) await this.ensureCallback();
    try {
      const provider = new StoredOAuthProvider(
        await this.load(connection.id),
        this.persister(connection.id),
        this.redirect(connector),
        flowId,
        undefined,
        this.oauthSettings(connector),
      );
      const result = await auth(provider, {
        serverUrl: this.serverUrl(connector),
        ...(connector.oauth ? { scope: connector.oauth.scopes.join(" ") } : {}),
        authorizationCode: code.slice(0, 2000),
        ...(this.options.fetch ? { fetchFn: this.options.fetch } : {}),
      });
      if (result !== "AUTHORIZED") throw new Error("not authorized");
    } catch {
      this.update(connection, {
        state: "failed",
        detail: "The service did not accept the sign-in. Try connecting again.",
      });
      return {
        ok: false,
        message: "Sign-in failed. Return to Socius and try again.",
      };
    }
    const verified = await this.verify(connection.id);
    if (verified.state !== "ready")
      return {
        ok: true,
        message:
          "Connected authentication. Actions are blocked until verification succeeds; check the connection status in Socius.",
      };
    this.store.event(
      "connector.connected",
      `Connected ${connection.connectorId}. Bots still need connector access granted.`,
    );
    return {
      ok: true,
      message: "Connected. You can close this tab and return to Socius.",
    };
  }

  /**
   * Runs `fn` with an authenticated client, then closes it. Sessions on one connection
   * run one at a time, so token refreshes and credential writes never race (the model can
   * issue parallel tool calls). Never starts a sign-in. Failures while opening the session
   * are raised as `OpenError`: no request reached the service.
   */
  async use<T>(
    connectionId: string,
    fn: (client: McpToolClient) => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(connectionId) ?? Promise.resolve();
    let release!: () => void;
    const tail = previous.then(() => new Promise<void>((r) => (release = r)));
    this.locks.set(connectionId, tail);
    await previous;
    try {
      const client = await this.open(connectionId);
      try {
        return await fn(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    } finally {
      release();
      if (this.locks.get(connectionId) === tail)
        this.locks.delete(connectionId);
    }
  }
  private async open(connectionId: string): Promise<McpToolClient> {
    const connection =
      this.get(connectionId) ?? fail(404, "Connection not found");
    if (connection.state === "disconnected")
      throw new OpenError(
        new ConnectorError("auth", "This connection was revoked."),
      );
    const connector = this.connector(connection.connectorId);
    if (connector.oauth?.clientIdEnv) await this.ensureCallback();
    try {
      const provider = new StoredOAuthProvider(
        await this.load(connection.id),
        this.persister(connection.id),
        this.redirect(connector),
        undefined,
        undefined,
        this.oauthSettings(connector),
      );
      return await connectMcp({
        url: this.serverUrl(connector),
        authProvider: provider,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        ...(this.options.timeoutMs
          ? { timeoutMs: this.options.timeoutMs }
          : {}),
      });
    } catch (error) {
      const failure = classifyError(error);
      if (failure.kind === "auth") this.markAuthRequired(connection.id);
      throw new OpenError(failure);
    }
  }
  markAuthRequired(connectionId: string) {
    const connection = this.get(connectionId);
    if (connection && connection.state !== "disconnected")
      this.update(connection, {
        state: "authentication-required",
        detail:
          "Access expired or was revoked in the service. Reconnect to continue.",
      });
  }

  /** Confirms the upstream server still offers the reviewed tools and inputs. */
  async verify(connectionId: string) {
    const connection =
      this.get(connectionId) ?? fail(404, "Connection not found");
    if (connection.state === "disconnected")
      fail(409, "This connection was revoked");
    try {
      const problem = checkToolSchemas(
        this.connector(connection.connectorId),
        await this.use(connectionId, (client) => client.listTools()),
      );
      return problem
        ? this.update(connection, {
            state: "unsupported",
            detail: `${problem} Socius blocks its actions until the integration is reviewed again.`,
          })
        : this.update(connection, {
            state: "ready",
            detail:
              "Connected. Grant connector access to each bot that should use it.",
          });
    } catch (error) {
      const failure = classifyError(
        error instanceof OpenError ? error.failure : error,
      );
      if (failure.kind === "auth") {
        this.markAuthRequired(connectionId);
        return this.get(connectionId)!;
      }
      return this.update(connection, {
        state: "failed",
        detail:
          error instanceof OpenError && failure.kind === "rejected"
            ? failure.message
            : "Could not reach the service. Check your connection and retry.",
      });
    }
  }

  /** Deletes local credentials and asks the provider to revoke them (best effort). */
  async disconnect(connectionId: string) {
    const connection =
      this.get(connectionId) ?? fail(404, "Connection not found");
    for (const [id, flow] of this.flows)
      if (flow.connectionId === connectionId) this.flows.delete(id);
    let revoked = false;
    try {
      const state = await this.load(connectionId);
      const metadata = state.discoveryState?.authorizationServerMetadata as
        { revocation_endpoint?: string } | undefined;
      const token = state.tokens?.refresh_token ?? state.tokens?.access_token;
      const clientId =
        (state.clientInformation as { client_id?: string } | undefined)
          ?.client_id ??
        this.oauthSettings(this.connector(connection.connectorId))?.client
          ?.client_id;
      if (metadata?.revocation_endpoint && token && clientId) {
        const response = await (this.options.fetch ?? fetch)(
          metadata.revocation_endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token, client_id: clientId }),
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          },
        );
        revoked = response.ok;
      }
    } catch {
      /* Local deletion below still removes Socius' access to the credentials. */
    }
    this.store.deleteConnectionSecret(connectionId);
    for (const row of this.store.db
      .prepare("SELECT id,data FROM records WHERE kind=?")
      .all("connector-grant")) {
      if (JSON.parse(row.data as string).connectorId === connection.connectorId)
        this.store.delete("connector-grant", row.id as string);
    }
    this.update(connection, {
      state: "disconnected",
      detail: revoked
        ? "Disconnected and revoked with the provider."
        : "Disconnected. Socius deleted its credentials; also remove Socius in the provider's connection settings to be certain.",
    });
    this.store.event(
      "connector.disconnected",
      `Disconnected ${connection.connectorId}. Stored credentials were deleted.`,
    );
    return connection;
  }
}
