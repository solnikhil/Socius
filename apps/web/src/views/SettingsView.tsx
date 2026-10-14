import { useState, type FormEvent } from "react";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import type { ModelSettings, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote } from "../components/ui.js";

export function SettingsView({
  state,
  onRefresh,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<ModelSettings>(state.settings),
    [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api("settings", {
        provider: settings.provider,
        model: settings.model,
        baseURL: settings.baseURL,
        ...(key ? { apiKey: key } : {}),
        clearApiKey: clearKey,
      });
      setKey("");
      setClearKey(false);
      await onRefresh();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page settings-page">
      <span className="eyebrow">YOUR ALLY, YOUR CHOICES</span>
      <h1>Make yourself at home.</h1>
      <p className="subtitle">
        Choose where your model runs and how your workspace works.
      </p>
      <div className="settings-card">
        <div className="settings-heading">
          <Sparkles size={20} />
          <div>
            <h2>Model connection</h2>
            <p>One provider interface. Your choice of model.</p>
          </div>
        </div>
        <form className="form" onSubmit={save}>
          <label>
            Provider
            <select
              value={settings.provider}
              onChange={(e) => {
                const provider = e.target.value as ModelSettings["provider"];
                setSettings({
                  ...settings,
                  provider,
                  baseURL:
                    provider === "ollama"
                      ? "http://127.0.0.1:11434/v1"
                      : provider === "compatible"
                        ? "http://127.0.0.1:1234/v1"
                        : provider === "openai"
                          ? "https://api.openai.com/v1"
                          : "https://api.anthropic.com",
                });
                setSaved(false);
              }}
            >
              <option value="ollama">Ollama · local</option>
              <option value="compatible">
                OpenAI-compatible · LM Studio / llama.cpp
              </option>
              <option value="openai">OpenAI · cloud</option>
              <option value="anthropic">Anthropic · cloud</option>
            </select>
          </label>
          <label>
            Model ID
            <input
              required
              placeholder="Enter a model available on your provider"
              value={settings.model}
              onChange={(e) =>
                setSettings({ ...settings, model: e.target.value })
              }
            />
          </label>
          {["ollama", "compatible"].includes(settings.provider) && (
            <label>
              API endpoint
              <input
                type="url"
                required
                value={settings.baseURL}
                onChange={(e) =>
                  setSettings({ ...settings, baseURL: e.target.value })
                }
              />
            </label>
          )}
          {settings.provider !== "ollama" && (
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  state.settings.hasApiKey
                    ? "A key is saved. Leave blank to keep it."
                    : "Enter your provider API key"
                }
                value={key}
                disabled={!state.secretStorage}
                onChange={(e) => setKey(e.target.value)}
              />
              <small>
                {state.secretStorage
                  ? "Stored using OS-backed encryption. Never returned to this interface."
                  : "Browser mode uses environment keys. Save keys through the Electron app."}
              </small>
            </label>
          )}
          {state.settings.hasApiKey && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
              />
              Remove saved key
            </label>
          )}
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <span>
              {settings.provider === "ollama"
                ? "Chat context is sent to the configured Ollama endpoint. Use a local model for offline inference."
                : settings.provider === "compatible"
                  ? "Chat context is sent to this endpoint. Confirm whether your server uses local or cloud inference."
                  : "Your conversation, attachments, and retrieved memory are sent to this cloud provider."}
            </span>
          </div>
          <ErrorNote error={error} />
          <div className="save-row">
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save connection"}
              <Check size={16} />
            </button>
            {saved && (
              <span className="saved" role="status">
                Connection saved
              </span>
            )}
          </div>
        </form>
      </div>
      <div className="settings-card">
        <div className="settings-heading">
          <ShieldCheck size={20} />
          <div>
            <h2>Local workspace</h2>
            <p>
              Chats and bot state are stored in SQLite. Memories are editable
              Markdown files.
            </p>
          </div>
        </div>
        <div className="detail-list">
          <div>
            <span>Analytics</span>
            <strong>Off</strong>
          </div>
          <div>
            <span>Automatic external actions</span>
            <strong>Unavailable</strong>
          </div>
          <div>
            <span>Bot and memory proposals</span>
            <strong>Review before applying</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
