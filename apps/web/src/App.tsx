import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Layers,
  LoaderCircle,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Activity as ActivityIcon,
} from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import { api } from "./api.js";
import { Avatar, ErrorNote } from "./components/ui.js";

import { Chat } from "./views/Chat.js";
import { Marketplace } from "./views/Marketplace.js";
import { MemoryView } from "./views/MemoryView.js";
import { ActivityView } from "./views/ActivityView.js";
import { SettingsView } from "./views/SettingsView.js";
import { CreateBot } from "./views/CreateBot.js";
type Page = "chat" | "marketplace" | "memory" | "activity" | "settings";
export function App() {
  const [state, setState] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState<Page>("chat"),
    [creating, setCreating] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    try {
      const next = await api<Snapshot>("state");
      setState(next);
      setSelected((s) => s || next.bots[0]?.id || "");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, []);
  const current = state?.bots.find((b) => b.id === selected) ?? state?.bots[0];
  if (!state || !current)
    return (
      <div className="boot">
        <span className="brand-mark">
          <Sparkles />
        </span>
        <h1>Socius</h1>
        <p>{error || "Starting your local workspace…"}</p>
        {error && <button onClick={() => void refresh()}>Retry</button>}
      </div>
    );
  const pending = state.approvals.filter(
    (a) => a.state === "pending" && Date.parse(a.expiresAt) > Date.now(),
  );
  const nav: { page: Page; label: string; icon: ReactNode }[] = [
    { page: "marketplace", label: "Marketplace", icon: <Layers size={18} /> },
    { page: "memory", label: "Memory", icon: <BookOpen size={18} /> },
    { page: "activity", label: "Activity", icon: <ActivityIcon size={18} /> },
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <strong>Socius</strong>
          <span className="version">v0.1</span>
        </div>
        <button className="new-bot" onClick={() => setCreating(true)}>
          <Plus size={17} />
          New bot
        </button>
        <div className="nav-group">
          {nav.map((n) => (
            <button
              key={n.page}
              className={`nav-item ${page === n.page ? "active" : ""}`}
              onClick={() => setPage(n.page)}
            >
              {n.icon}
              {n.label}
              {n.page === "activity" && pending.length > 0 && (
                <span className="count">{pending.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-label">
          YOUR BOTS<span>{state.bots.length}</span>
        </div>
        <div className="bot-list">
          {state.bots.map((b) => (
            <button
              key={b.id}
              className={`bot-item ${page === "chat" && b.id === current.id ? "active" : ""}`}
              onClick={() => {
                setSelected(b.id);
                setPage("chat");
              }}
            >
              <Avatar name={b.name} />
              <span>
                <strong>{b.name}</strong>
                <small>{b.role}</small>
              </span>
              {state.tasks.some(
                (t) => t.botId === b.id && t.state === "running",
              ) ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <span className="online" />
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => setPage("settings")}
          >
            <Settings size={18} />
            Settings
          </button>
          <div className="local-status">
            <span className="online" />
            <span>Local workspace</span>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            {page === "chat" ? (
              <>
                <Avatar name={current.name} />
                <span>
                  <strong>{current.name}</strong>
                  <small>{current.role}</small>
                </span>
              </>
            ) : (
              <>
                <span className="page-icon">
                  {nav.find((n) => n.page === page)?.icon ?? (
                    <Settings size={20} />
                  )}
                </span>
                <strong>{page[0]!.toUpperCase() + page.slice(1)}</strong>
              </>
            )}
          </div>
          <div className="top-meta">
            <span className="status-pill">
              <span className="online" />
              On your device
            </span>
            <button
              className="icon"
              aria-label="Create a new bot"
              onClick={() => setCreating(true)}
            >
              <Plus size={18} />
            </button>
          </div>
        </header>
        <ErrorNote error={error} />
        {page === "chat" && (
          <Chat
            key={current.id}
            bot={current}
            state={state}
            onRefresh={refresh}
            onSettings={() => setPage("settings")}
          />
        )}
        {page === "marketplace" && (
          <Marketplace state={state} onRefresh={refresh} />
        )}
        {page === "memory" && (
          <MemoryView
            key={current.id}
            bot={current}
            bots={state.bots}
            onSelect={setSelected}
          />
        )}
        {page === "activity" && (
          <ActivityView state={state} onRefresh={refresh} />
        )}
        {page === "settings" && (
          <SettingsView state={state} onRefresh={refresh} />
        )}
      </main>
      {creating && (
        <CreateBot
          onClose={() => setCreating(false)}
          onCreated={(b) => {
            setSelected(b.id);
            setPage("chat");
            void refresh();
          }}
        />
      )}
    </div>
  );
}
