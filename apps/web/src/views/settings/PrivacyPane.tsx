import type { Snapshot } from "@socius/contracts/app";
import { provider } from "@socius/contracts/providers";
import { ShieldCheck } from "lucide-react";
import { ProviderMark } from "../../components/ProviderMark.js";
import { destinationNote } from "../../models.js";

export function PrivacyPane({ state }: { state: Snapshot }) {
  return (
    <>
      <header className="pane-head">
        <h3>Privacy & data</h3>
        <p>What stays on this computer and what leaves it.</p>
      </header>
      <div className="pane-section">
        <h4>Where chat context goes</h4>
        {state.connections.length === 0 ? (
          <p className="muted">
            No provider is connected, so nothing is sent anywhere.
          </p>
        ) : (
          <ul className="destination-list">
            {state.connections.map((c) => (
              <li key={c.id}>
                <ProviderMark id={c.provider} size={26} />
                <span>{destinationNote(provider(c.provider), c.label)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="pane-section">
        <h4>Credentials</h4>
        <div className="privacy-note">
          <ShieldCheck size={17} />
          <span>
            {state.secretStorage
              ? "Keys are encrypted with your operating system’s credential storage. They are never sent back to this window, written to activity, or included in error messages."
              : "This browser session cannot store keys. Socius uses provider environment variables on the computer running it."}
          </span>
        </div>
      </div>
      <div className="pane-section">
        <h4>Local workspace</h4>
        <div className="detail-list">
          <div>
            <span>Chats and bot state</span>
            <strong>SQLite on this computer</strong>
          </div>
          <div>
            <span>Memories</span>
            <strong>Editable Markdown files</strong>
          </div>
          <div>
            <span>Analytics and crash reporting</span>
            <strong>Off</strong>
          </div>
          <div>
            <span>Automatic external actions</span>
            <strong>Unavailable</strong>
          </div>
          <div>
            <span>Private memory updates</span>
            <strong>
              {state.dreaming.settings.enabled
                ? "Automatic dreaming enabled"
                : "Manual edits and reviewed proposals"}
            </strong>
          </div>
        </div>
      </div>
    </>
  );
}
