import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sun,
  User,
  X,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Snapshot } from "@socius/contracts/app";
import { api } from "./api.js";
import {
  Avatar,
  ErrorNote,
  MAIN_BOT_TEMPLATE,
  useDismiss,
  useTheme,
  type ThemePreference,
} from "./components/ui.js";
import { AppIcon } from "./components/AppIcon.js";
import { Chat } from "./views/Chat.js";
import { NewChat } from "./views/NewChat.js";
import { ConnectApps } from "./views/ConnectApps.js";
import { MemoryView } from "./views/MemoryView.js";
import { SettingsView } from "./views/SettingsView.js";
import { ActivityView } from "./views/ActivityView.js";
import { CreateBot } from "./views/CreateBot.js";

type Page = "chat" | "new" | "memory" | "settings" | "activity";
const isMacDesktop =
  /Electron/.test(navigator.userAgent) && /Mac/.test(navigator.platform);

export function App() {
  const [state, setState] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState<Page>("chat"),
    [creating, setCreating] = useState(false),
    [apps, setApps] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [error, setError] = useState("");
  const [theme, setTheme] = useTheme();
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "n" || e.key === "k") {
        e.preventDefault();
        setPage("new");
      }
      if (e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("mac-desktop", isMacDesktop);
  }, []);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useDismiss(menu, closeMenu);

  const current = state?.bots.find((b) => b.id === selected) ?? state?.bots[0];
  if (!state || !current)
    return (
      <div className="boot">
        <Avatar name="Socius" main size={64} />
        <h1>Socius</h1>
        <p>{error || "Starting your local workspace…"}</p>
        {error && <button onClick={() => void refresh()}>Retry</button>}
      </div>
    );
  const pending = state.approvals.filter(
    (a) => a.state === "pending" && Date.parse(a.expiresAt) > Date.now(),
  );
  const main =
    state.bots.find((b) => b.template.id === MAIN_BOT_TEMPLATE) ??
    state.bots[0]!;
  const specialists = state.bots.filter((b) => b.id !== main.id);
  const running = (b: BotInstance) =>
    state.tasks.some((t) => t.botId === b.id && t.state === "running");
  const waiting = (b: BotInstance) => pending.some((a) => a.botId === b.id);
  const open = (b: BotInstance) => {
    setSelected(b.id);
    setPage("chat");
  };
  const connected = state.catalog.filter((p) =>
    state.installations.some((i) => i.id === p.id && p.kind !== "bot"),
  );

  const toolbar = (
    <div className="window-tools">
      <button
        className="icon ghost"
        aria-label="Hide sidebar"
        title={"Hide sidebar  ⌘\\"}
        onClick={() => setCollapsed((c) => !c)}
      >
        <PanelLeft size={17} />
      </button>
      <button
        className="icon round"
        aria-label="Search bots"
        title="Search  ⌘K"
        onClick={() => setPage("new")}
      >
        <Search size={17} />
      </button>
      <button
        className="icon round"
        aria-label="New chat"
        title="New chat  ⌘N"
        onClick={() => setPage("new")}
      >
        <Plus size={19} />
      </button>
    </div>
  );
  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] =
    [
      { value: "system", label: "System", icon: Monitor },
      { value: "light", label: "Light", icon: Sun },
      { value: "dark", label: "Dark", icon: Moon },
    ];

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Bots" inert={collapsed}>
        <div className="sidebar-top drag">{toolbar}</div>
        <div className="sidebar-scroll">
          <div className="featured">
            <button
              className={`featured-bot ${page === "chat" && current.id === main.id ? "active" : ""}`}
              onClick={() => open(main)}
            >
              <Avatar name={main.name} main size={66} badge />
              <span>{main.name}</span>
              {(running(main) || waiting(main)) && (
                <span
                  className={`review-dot ${running(main) ? "pulse" : ""}`}
                  aria-label={running(main) ? "Working" : "Needs review"}
                />
              )}
            </button>
          </div>
          {specialists.length > 0 && (
            <section className="bot-group">
              <h3>Specialists</h3>
              {specialists.map((b) => (
                <button
                  key={b.id}
                  className={`bot-row ${page === "chat" && b.id === current.id ? "active" : ""}`}
                  onClick={() => open(b)}
                >
                  <Avatar name={b.name} size={42} />
                  <span className="bot-text">
                    <strong>{b.name}</strong>
                    <small>{running(b) ? "Working…" : b.role}</small>
                  </span>
                  {(waiting(b) || running(b)) && (
                    <span
                      className={`unread ${running(b) ? "pulse" : ""}`}
                      aria-label={running(b) ? "Working" : "Needs review"}
                    />
                  )}
                </button>
              ))}
            </section>
          )}
          <section className="bot-group compact">
            <button className="group-link" onClick={() => setCreating(true)}>
              New bot
              <Plus size={14} />
            </button>
            <button
              className={`group-link ${page === "activity" ? "active" : ""}`}
              onClick={() => setPage("activity")}
            >
              Activity
            </button>
            <button
              className={`group-link ${page === "memory" ? "active" : ""}`}
              onClick={() => setPage("memory")}
            >
              Memory
            </button>
          </section>
        </div>
        <div className="sidebar-bottom">
          <div className="account" ref={menuRef}>
            <button
              className="account-button"
              aria-label="Account and settings"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <User size={16} />
            </button>
            {menu && (
              <div className="popover account-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setPage("settings");
                    setMenu(false);
                  }}
                >
                  <Settings size={15} />
                  Settings
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setPage("memory");
                    setMenu(false);
                  }}
                >
                  <BookOpen size={15} />
                  Memory
                </button>
                <div className="menu-divider" />
                <div className="menu-label">Appearance</div>
                <div className="segmented" role="radiogroup" aria-label="Theme">
                  {themes.map((t) => (
                    <button
                      key={t.value}
                      role="radio"
                      aria-checked={theme === t.value}
                      className={theme === t.value ? "selected" : ""}
                      onClick={() => setTheme(t.value)}
                    >
                      <t.icon size={14} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="connect-apps" onClick={() => setApps(true)}>
            Connect apps
            <span className="app-stack" aria-hidden="true">
              {(connected.length ? connected : state.catalog.slice(1, 3))
                .slice(0, 2)
                .map((p) => (
                  <AppIcon key={p.id} item={p} size={18} />
                ))}
            </span>
          </button>
        </div>
      </aside>
      <main>
        <button
          className="sidebar-reveal icon ghost"
          aria-label="Show sidebar"
          title={"Show sidebar  ⌘\\"}
          tabIndex={collapsed ? 0 : -1}
          aria-hidden={!collapsed}
          onClick={() => setCollapsed(false)}
        >
          <PanelLeft size={17} />
        </button>
        <ErrorNote error={error} />
        {page === "chat" && (
          <Chat
            key={current.id}
            bot={current}
            main={current.id === main.id}
            state={state}
            onRefresh={refresh}
            onSettings={() => setPage("settings")}
          />
        )}
        {page === "new" && (
          <NewChat
            bots={[main, ...specialists]}
            mainId={main.id}
            onClose={() => setPage("chat")}
            onPick={open}
            onCreate={() => {
              setPage("chat");
              setCreating(true);
            }}
          />
        )}
        {(page === "memory" || page === "settings" || page === "activity") && (
          <div className="page-frame">
            <header className="page-bar drag">
              <span>
                {page === "memory"
                  ? "Memory"
                  : page === "settings"
                    ? "Settings"
                    : "Activity"}
              </span>
              <button
                className="icon ghost"
                aria-label="Close"
                onClick={() => setPage("chat")}
              >
                <X size={17} />
              </button>
            </header>
            {page === "memory" && (
              <MemoryView
                key={current.id}
                bot={current}
                bots={state.bots}
                onSelect={setSelected}
              />
            )}
            {page === "settings" && (
              <SettingsView
                state={state}
                onRefresh={refresh}
                theme={theme}
                onTheme={setTheme}
                onOpenActivity={() => setPage("activity")}
              />
            )}
            {page === "activity" && <ActivityView events={state.activity} />}
          </div>
        )}
      </main>
      {apps && (
        <ConnectApps
          state={state}
          onRefresh={refresh}
          onClose={() => setApps(false)}
        />
      )}
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
