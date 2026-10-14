import { useEffect, useState } from "react";
/** Connectivity is not enough to distinguish sleep, a stopped app and a lost network route. */
export function ConnectionBanner() {
  const [message, setMessage] = useState("Connecting…");
  useEffect(() => {
    let live = true;
    const update = (e: Event) => {
      if (live) setMessage((e as CustomEvent<string>).detail);
    };
    const offline = () => setMessage("Offline. Actions are not queued.");
    const online = () => setMessage("Connecting…");
    window.addEventListener("socius-connection", update);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      live = false;
      window.removeEventListener("socius-connection", update);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  return message ? (
    <div className="connection-banner" role="status">
      {message}
    </div>
  ) : null;
}
export function connectionState(message: string) {
  window.dispatchEvent(
    new CustomEvent("socius-connection", { detail: message }),
  );
}
