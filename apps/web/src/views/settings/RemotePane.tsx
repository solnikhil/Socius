import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type {
  RemoteAccessStatus,
  PairedDevice,
  PhonePairing,
} from "@socius/contracts/app";
import { api } from "../../api.js";
export function RemotePane() {
  const [status, setStatus] = useState<RemoteAccessStatus | null>(null),
    [origin, setOrigin] = useState(""),
    [enabled, setEnabled] = useState(false),
    [devices, setDevices] = useState<PairedDevice[]>([]),
    [error, setError] = useState(""),
    [pair, setPair] = useState<PhonePairing | null>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    setQr("");
    if (!pair || !status?.origin) return;
    let live = true;
    void QRCode.toDataURL(`${status.origin}/#pair=${pair.token}`, {
      width: 240,
      margin: 4,
    }).then((url) => {
      if (live) setQr(url);
    });
    const timer = setTimeout(
      () => setPair(null),
      Math.max(0, Date.parse(pair.expiresAt) - Date.now()),
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pair, status?.origin]);
  async function refresh() {
    const s = await api<RemoteAccessStatus>("remote/status");
    setStatus(s);
    setOrigin(s.origin);
    setEnabled(s.enabled);
    const d = await api<{ devices: PairedDevice[] }>("devices");
    setDevices(d.devices);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function act(fn: () => Promise<unknown>) {
    try {
      setError("");
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <header className="pane-head">
        <h3>Remote access & devices</h3>
        <p>
          Your phone controls this same running workspace. Keep the laptop awake
          and Socius running.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {status?.localOwner && (
        <section className="pane-section">
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enable private remote access
          </label>
          <label>
            {" "}
            Tailscale HTTPS origin
            <input
              aria-label="Tailscale HTTPS origin"
              placeholder="https://laptop.tailname.ts.net"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </label>
          <button
            onClick={() =>
              void act(async () => {
                await api("remote/settings", { enabled, origin });
                setPair(null);
              })
            }
          >
            Save remote settings
          </button>
          <p>
            {status.enabled ? "Enabled" : "Disabled"} · Local target:{" "}
            <code>{status.localTarget}</code>
          </p>
          {status.needsServeUpdate && (
            <p role="alert">
              Serve target needs updating. Run the new command, then save remote
              settings to acknowledge this target.
            </p>
          )}
          <p>
            {status.cliAvailable
              ? "Tailscale CLI found. Sign-in, HTTPS and tailnet policy still need checking."
              : "Tailscale CLI not found on PATH. Install Tailscale and sign in on your laptop and phone; restart Socius after CLI setup."}
          </p>
          <p>
            Inspect existing Serve settings first; this command uses HTTPS port
            443 and its root route. Preserve any other service already using it.
          </p>
          <pre>{status.serveCommand}</pre>
          <p>
            To stop this HTTPS listener, after checking it is only used by
            Socius:
          </p>
          <pre>{status.teardownCommand}</pre>
          <button
            disabled={!status.enabled}
            onClick={() =>
              void act(async () =>
                setPair(await api<PhonePairing>("devices/pair", {})),
              )
            }
          >
            Pair a phone
          </button>
          {pair && (
            <div className="phone-pairing">
              {qr && (
                <img
                  src={qr}
                  alt="Scan to pair your phone"
                  width={240}
                  height={240}
                />
              )}
              <p>
                Expires at {new Date(pair.expiresAt).toLocaleTimeString()}. Keep
                this pairing information private.
              </p>
              <p>
                Pairing code: <strong>{pair.code}</strong>
              </p>
              <a
                href={`${status.origin}/#pair=${pair.token}`}
                target="_blank"
                rel="noreferrer"
              >
                Open phone pairing link
              </a>
            </div>
          )}
          <button
            onClick={() =>
              void act(async () => {
                await api("devices/revoke-remote", {});
                setPair(null);
              })
            }
          >
            Revoke all phones
          </button>
        </section>
      )}
      <section className="pane-section">
        <h4>Devices</h4>
        {devices.map((d) => (
          <div className="device-row" key={d.id}>
            <span>
              {d.label} · {d.originKind} ·{" "}
              {d.revokedAt
                ? "Revoked"
                : `Last used ${new Date(d.lastUsedAt).toLocaleString()}`}
            </span>
            {status?.localOwner &&
              d.originKind === "remote" &&
              !d.revokedAt && (
                <button
                  onClick={() =>
                    void act(() => api(`devices/${d.id}/revoke`, {}))
                  }
                >
                  Revoke {d.label}
                </button>
              )}
          </div>
        ))}
        {!status?.localOwner && (
          <>
            <p>Manage other devices and host settings on your laptop.</p>
            <button
              onClick={() =>
                void act(async () => {
                  await api("devices/signout", {});
                  location.reload();
                })
              }
            >
              Sign out this phone
            </button>
          </>
        )}
      </section>
    </>
  );
}
