import { useEffect, useState } from "react";
import { Check, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Capability, Manifest } from "@socius/contracts";
import type {
  ConnectionState,
  ExportPreview,
  InstallPreview,
  Release,
  Snapshot,
} from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, Modal } from "../components/chrome.js";
import { AppIcon } from "../components/AppIcon.js";

export const trustLabel: Record<Release["trust"], string> = {
  curated: "Curated by Socius",
  reviewed: "Registry entry reviewed by Socius",
  "local-unverified": "Imported locally · publisher not verified",
};
export type ConnectorStatus =
  | "not-installed"
  | "disabled"
  | "unsupported-storage"
  | "not-connected"
  | ConnectionState;
const statusLabel: Record<ConnectorStatus, string> = {
  "not-installed": "Not installed",
  disabled: "Disabled",
  "unsupported-storage": "Unsupported here",
  "not-connected": "Authentication required",
  ready: "Ready",
  "authentication-required": "Authentication required",
  disconnected: "Disconnected",
  unsupported: "Unsupported",
  failed: "Failed",
};
export function connectorStatus(state: Snapshot, id: string) {
  const receipt = state.installations.find((i) => i.id === id);
  const connection = state.connectorConnections
    .filter((c) => c.connectorId === id && c.state !== "disconnected")
    .at(-1);
  const revoked = state.connectorConnections
    .filter((c) => c.connectorId === id)
    .at(-1);
  const status: ConnectorStatus = !receipt
    ? "not-installed"
    : !receipt.enabled
      ? "disabled"
      : !state.secretStorage
        ? "unsupported-storage"
        : (connection?.state ?? (revoked ? "disconnected" : "not-connected"));
  const detail =
    status === "unsupported-storage"
      ? "Connecting accounts needs OS-backed credential encryption. Use the desktop app."
      : status === "disabled"
        ? "Enable the connector to use it. Bots cannot call it while disabled."
        : status === "not-installed"
          ? "Install to review its setup."
          : (connection?.detail ??
            revoked?.detail ??
            "Sign in through your browser to connect.");
  return { status, label: statusLabel[status], detail, connection };
}

const capabilityText: Partial<Record<Capability, string>> = {
  "documents.read": "Read documents and pages",
  "documents.write": "Propose document changes (each needs approval)",
  "memory.read": "Read its private memory",
  "memory.write": "Propose memory saves",
  "tasks.delegate": "Delegate tasks",
};

export function PackageDetail({
  item,
  state,
  onRefresh,
  onClose,
}: {
  item: Manifest;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<InstallPreview | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState<ExportPreview | null>(null),
    [notice, setNotice] = useState("");
  const release = state.releases.find(
    (r) => r.manifest.id === item.id && r.manifest.version === item.version,
  );
  const receipt = state.installations.find((i) => i.id === item.id);
  const installedHere =
    receipt?.version === item.version && receipt.digest === release?.digest;
  useEffect(() => {
    api<InstallPreview>("install/preview", {
      id: item.id,
      version: item.version,
    })
      .then(setPlan)
      .catch((e) => setError((e as Error).message));
  }, [item.id, item.version, receipt?.version]);
  async function run(path: string, body: unknown, message = "") {
    setBusy(true);
    setError("");
    try {
      const result = await api<Record<string, unknown>>(path, body);
      await onRefresh();
      if (message) setNotice(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const fresh = plan?.newCapabilities ?? [];
  const isUpdate = !!receipt && receipt.version !== item.version;
  const connector =
    item.kind === "connector" ? connectorStatus(state, item.id) : null;
  const deps = plan?.packages.filter((p) => p.manifest.id !== item.id) ?? [];
  return (
    <Modal
      title={item.name}
      className="install-dialog package-detail"
      onClose={onClose}
    >
      <div className="install-hero">
        <AppIcon item={item} size={52} />
        <p>{item.description}</p>
      </div>
      {release && (
        <div className={`trust-badge trust-${release.trust}`}>
          {release.trust === "local-unverified" ? (
            <ShieldAlert size={15} />
          ) : (
            <ShieldCheck size={15} />
          )}
          {trustLabel[release.trust]}
        </div>
      )}
      <div className="detail-list">
        <div>
          <span>Publisher</span>
          <strong>{item.publisher}</strong>
        </div>
        <div>
          <span>Version</span>
          <strong>
            {item.version}
            {receipt &&
              receipt.version !== item.version &&
              ` (installed ${receipt.version})`}
          </strong>
        </div>
        <div>
          <span>Source</span>
          <strong>
            {release?.source.type === "mcp-registry"
              ? `MCP Registry · ${release.source.name}@${release.source.version}`
              : release?.source.type === "local-import"
                ? `Local import · ${release.source.label}`
                : "Bundled with Socius"}
          </strong>
        </div>
        <div>
          <span>License</span>
          <strong>{item.license}</strong>
        </div>
        {item.compatibility && (
          <div>
            <span>Compatibility</span>
            <strong>{item.compatibility}</strong>
          </div>
        )}
        {release && (
          <div>
            <span>Release digest</span>
            <strong className="mono" title={release.digest}>
              {release.digest.slice(0, 16)}…
            </strong>
          </div>
        )}
        <div>
          <span>Dependencies</span>
          <strong>
            {deps.length
              ? deps
                  .map(
                    (d) =>
                      `${d.manifest.name} ${d.manifest.version}${d.installed ? " ✓" : ""}`,
                  )
                  .join(", ")
              : "None"}
          </strong>
        </div>
        <div>
          <span>Requested permissions</span>
          <strong>
            {plan?.requestedCapabilities.length
              ? plan.requestedCapabilities.map((c) => (
                  <span
                    key={c}
                    className={`cap ${fresh.includes(c) ? "new" : ""}`}
                  >
                    {capabilityText[c] ?? c}
                    {fresh.includes(c) && isUpdate ? " (new)" : ""}
                  </span>
                ))
              : "None"}
          </strong>
        </div>
        {item.kind === "skill" && item.allowedTools?.length ? (
          <div>
            <span>Requested tools</span>
            <strong>
              {item.allowedTools.join(", ")} · requests only; Socius policy
              decides
            </strong>
          </div>
        ) : null}
        {item.kind === "skill" && item.resources?.length ? (
          <div>
            <span>Files</span>
            <strong>
              {item.resources
                .map((r) => `${r.path}${r.kind === "script" ? " (inert)" : ""}`)
                .join(", ")}
            </strong>
          </div>
        ) : null}
      </div>
      {release?.trust === "local-unverified" && (
        <p className="muted">
          The digest proves this content has not changed since import. It does
          not prove who wrote it. Read the instructions before installing.
        </p>
      )}
      {item.kind === "skill" && !installedHere && (
        <details className="instructions-preview">
          <summary>Read the instructions</summary>
          <pre>{item.instructions}</pre>
        </details>
      )}
      <p className="muted">
        {item.kind === "bot"
          ? "Creates a fresh private bot. No credentials, memories or permissions transfer."
          : item.kind === "connector"
            ? "Installing grants nothing. Sign in separately, then choose which bots may read or propose changes."
            : "Instruction-only skill. Bots load it when relevant; scripts are never run."}
      </p>
      {!installedHere && fresh.length > 0 && (
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I allow this {isUpdate ? "update" : "package"} to request:{" "}
          {fresh.join(", ")}. Bots still need separate grants.
        </label>
      )}
      {connector && receipt && item.kind === "connector" && (
        <ConnectorSetup item={item} state={state} busy={busy} run={run} />
      )}
      {notice && (
        <div className="saved" role="status">
          {notice}
        </div>
      )}
      <ErrorNote error={error} />
      <div className="modal-actions wrap">
        {receipt && item.kind !== "bot" && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                void run("installations/enable", {
                  id: item.id,
                  enabled: !receipt.enabled,
                })
              }
            >
              {receipt.enabled ? "Disable" : "Enable"}
              {installedHere ? "" : ` ${receipt.version}`}
            </button>
            {receipt.history.length > 0 && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(
                    "installations/rollback",
                    { id: item.id },
                    `Rolled back to ${receipt.history.at(-1)!.version}.`,
                  )
                }
              >
                Roll back to {receipt.history.at(-1)!.version}
              </button>
            )}
            <button
              disabled={busy}
              onClick={async () => {
                if (await run("installations/uninstall", { id: item.id }))
                  onClose();
              }}
            >
              Uninstall{installedHere ? "" : ` ${receipt.version}`}
            </button>
          </>
        )}
        {item.kind === "skill" && (
          <button
            disabled={busy}
            onClick={async () => {
              setError("");
              try {
                setExporting(
                  await api<ExportPreview>("export/skill/preview", {
                    id: item.id,
                    version: item.version,
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Export
          </button>
        )}
        {(!installedHere || item.kind === "bot") &&
          release?.compatible !== false && (
            <button
              className="primary"
              disabled={busy || !plan || (fresh.length > 0 && !consent)}
              onClick={async () => {
                const result = await run(
                  "install",
                  {
                    id: item.id,
                    version: item.version,
                    digest: plan!.digest,
                    consent: consent ? fresh : [],
                  },
                  item.kind === "bot"
                    ? "Bot added."
                    : isUpdate
                      ? "Updated."
                      : "Installed.",
                );
                // Connectors stay open so the user can sign in next.
                if (result && item.kind !== "connector") onClose();
              }}
            >
              {busy
                ? "Working…"
                : item.kind === "bot"
                  ? "Add bot"
                  : isUpdate
                    ? `Update to ${item.version}`
                    : item.kind === "connector"
                      ? "Install connector"
                      : "Install skill"}
            </button>
          )}
        {release?.compatible === false && (
          <span className="muted">{release.incompatibility}</span>
        )}
      </div>
      {exporting && (
        <ExportReview
          preview={exporting}
          onClose={() => setExporting(null)}
          onConfirm={(acknowledge) =>
            api<{ path: string }>("export/skill", {
              id: item.id,
              version: item.version,
              digest: exporting.digest,
              acknowledge,
            })
          }
        />
      )}
    </Modal>
  );
}

function ConnectorSetup({
  item,
  state,
  busy,
  run,
}: {
  item: Extract<Manifest, { kind: "connector" }>;
  state: Snapshot;
  busy: boolean;
  run: (
    path: string,
    body: unknown,
    message?: string,
  ) => Promise<Record<string, unknown> | null>;
}) {
  const { status, label, detail, connection } = connectorStatus(state, item.id);
  const [link, setLink] = useState("");
  async function connect() {
    const result = await run("connectors/connect", { connectorId: item.id });
    if (!result) return;
    const url = String(result.authorizationUrl);
    // Browser mode opens the provider page in a new tab; desktop opens the system browser.
    if (!result.opened) window.open(url, "_blank", "noopener,noreferrer");
    setLink(url);
  }
  return (
    <section className="connector-setup" aria-label="Connection">
      <div className="connector-status">
        <span className={`status-dot status-${status}`} />
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      {item.tools && (
        <ul className="tool-list">
          {item.tools.map((t) => (
            <li key={t.id}>
              <span className={`access ${t.access}`}>{t.access}</span>
              {t.description}
            </li>
          ))}
        </ul>
      )}
      <div className="modal-actions wrap">
        {status !== "unsupported-storage" &&
          status !== "disabled" &&
          status !== "ready" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void connect()}
            >
              {status === "not-connected"
                ? `Connect ${item.name}`
                : "Reconnect"}
            </button>
          )}
        {connection && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                void run("connectors/verify", { connectionId: connection.id })
              }
            >
              Check connection
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  "connectors/disconnect",
                  { connectionId: connection.id },
                  "Disconnected and credentials deleted.",
                )
              }
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      {link && status !== "ready" && (
        <p className="muted">
          Finish signing in in your browser.{" "}
          <a href={link} target="_blank" rel="noreferrer noopener">
            Open sign-in again <ExternalLink size={12} />
          </a>
        </p>
      )}
      {status === "ready" && (
        <div className="grant-table" role="group" aria-label="Bot access">
          <div className="grant-row head">
            <span>Bot</span>
            <span>Read</span>
            <span>Propose changes</span>
          </div>
          {state.bots.map((b) => (
            <div key={b.id} className="grant-row">
              <span>{b.name}</span>
              {(["documents.read", "documents.write"] as const).map((c) => (
                <input
                  key={c}
                  type="checkbox"
                  aria-label={`${b.name} ${c}`}
                  checked={b.grantedCapabilities.includes(c)}
                  disabled={busy}
                  onChange={(e) =>
                    void run("grants", {
                      botId: b.id,
                      capability: c,
                      granted: e.target.checked,
                    })
                  }
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Human review step before anything leaves the workspace. */
export function ExportReview({
  preview,
  onClose,
  onConfirm,
}: {
  preview: ExportPreview;
  onClose: () => void;
  onConfirm: (
    acknowledge: boolean,
  ) => Promise<{ path: string; file?: { path: string; content: string } }>;
}) {
  const [ack, setAck] = useState(false),
    [done, setDone] = useState<{
      path: string;
      file?: { path: string; content: string };
    } | null>(null),
    [error, setError] = useState("");
  return (
    <Modal
      title="Review export"
      className="install-dialog export-review"
      onClose={onClose}
    >
      <p className="muted">
        Only the fields below are exported. Chats, memory, credentials, granted
        permissions and routines are never included.
      </p>
      {preview.files.map((f) => (
        <details key={f.path} open={preview.files.length === 1}>
          <summary>{f.path}</summary>
          <pre>{f.content}</pre>
        </details>
      ))}
      {preview.findings.length > 0 && (
        <div className="findings" role="alert">
          <strong>Check before sharing</strong>
          <ul>
            {preview.findings.map((f, i) => (
              <li key={i}>
                {f.kind.replace("-", " ")} in {f.field}: “{f.excerpt}”
              </li>
            ))}
          </ul>
          <label className="consent">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed these and they are safe to share.
          </label>
        </div>
      )}
      {done ? (
        <div className="saved" role="status">
          Exported to {done.path}
          {done.file && (
            <>
              {" · "}
              <a
                href={URL.createObjectURL(
                  new Blob([done.file.content], { type: "application/json" }),
                )}
                download={done.file.path}
              >
                Download
              </a>
            </>
          )}
        </div>
      ) : null}
      <ErrorNote error={error} />
      <div className="modal-actions">
        <button onClick={onClose}>{done ? "Close" : "Cancel"}</button>
        {!done && (
          <button
            className="primary"
            disabled={preview.findings.length > 0 && !ack}
            onClick={async () => {
              try {
                setDone(await onConfirm(ack));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Check size={15} />
            Export
          </button>
        )}
      </div>
    </Modal>
  );
}
