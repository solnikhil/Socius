import { useEffect, useState } from "react";
/** The fragment is consumed in memory and immediately removed from browser history. */
export function takePairingToken() {
  const m = /^#pair=([a-f0-9]{64})$/.exec(location.hash);
  if (m) {
    history.replaceState(null, "", location.pathname);
    return m[1]!;
  }
  return "";
}
export const initialPairingToken = takePairingToken();
export function PhonePairing({ onPaired }: { onPaired: () => void }) {
  const [challenge, setChallenge] = useState(initialPairingToken),
    [label, setLabel] = useState("My phone"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => () => setChallenge(""), []);
  return (
    <main className="boot phone-login">
      <h1>Pair with Socius</h1>
      <p>
        Start “Pair a phone” in Settings on your laptop, then scan its QR or
        enter its six-digit code here.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!navigator.onLine) {
            setError("Offline. Reconnect before pairing.");
            return;
          }
          setBusy(true);
          try {
            const r = await fetch("/api/remote/pair", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ challenge, label }),
            });
            if (!r.ok) {
              const d = await r.json();
              throw new Error(d.error);
            }
            setChallenge("");
            onPaired();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Device label
          <input
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Pairing code
          <input
            aria-label="Pairing code"
            autoComplete="off"
            value={challenge}
            maxLength={64}
            onChange={(e) => setChallenge(e.target.value)}
          />
        </label>
        <button disabled={busy || !challenge || !label}>Pair this phone</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p>The laptop must be awake and Socius running.</p>
    </main>
  );
}
