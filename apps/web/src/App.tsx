import { useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  BookOpen,
  ChevronRight,
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
import type { Category, GroupChat, Snapshot } from "@socius/contracts/app";
import { api } from "./api.js";
import {
  Avatar,
  ErrorNote,
  GroupAvatar,
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
import { SettingsDialog } from "./views/settings/SettingsDialog.js";
import type { OpenSettings, SettingsTab } from "./models.js";
import { ActivityView } from "./views/ActivityView.js";
import { CreateBot } from "./views/CreateBot.js";
import { CreateGroup } from "./views/CreateGroup.js";
import { BotMenu } from "./components/BotMenu.js";
import { CategoryMenu } from "./components/CategoryMenu.js";
import { EditCategory } from "./views/EditCategory.js";

const FOLDED_KEY = "socius.sidebar.folded";
// Collapsed sidebar sections are a per-device preference.
function readFolded(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

type Page = "chat" | "new" | "activity";
const isMacDesktop =
  /Electron/.test(navigator.userAgent) && /Mac/.test(navigator.platform);

export function App() {
  const [state, setState] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [groupId, setGroupId] = useState(""),
    [grouping, setGrouping] = useState<"new" | "edit" | null>(null),
    [page, setPage] = useState<Page>("chat"),
    [creating, setCreating] = useState(false),
    [folded, setFolded] = useState<Set<string>>(readFolded),
    [botMenu, setBotMenu] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null),
    [categoryMenu, setCategoryMenu] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null),
    [editingCategory, setEditingCategory] = useState<{
      category?: Category;
    } | null>(null),
    [apps, setApps] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [settings, setSettings] = useState<{
      tab: SettingsTab;
      connectionId?: string | undefined;
    } | null>(null),
    [memoryBot, setMemoryBot] = useState<string | null>(null),
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
  const openSettings: OpenSettings = useCallback(
    (tab, connectionId) => setSettings({ tab, connectionId }),
    [],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettings((s) => s ?? { tab: "general" });
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
    } catch {
      // Storage can be unavailable; folding still works for this session.
    }
  }, [folded]);
  const toggleFold = (key: string) =>
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    state.tasks.some(
      (t) => t.botId === b.id && !t.groupId && t.state === "running",
    );
  const waiting = (b: BotInstance) => pending.some((a) => a.botId === b.id);
  const open = (b: BotInstance) => {
    setSelected(b.id);
    setGroupId("");
    setPage("chat");
  };
  const openGroup = (g: GroupChat) => {
    setGroupId(g.id);
    setPage("chat");
  };
  const group = state.groups.find((g) => g.id === groupId);
  const faces = (g: GroupChat) => [
    { name: main.name, main: true },
    ...g.memberIds
      .map((id) => state.bots.find((b) => b.id === id))
      .filter((b): b is BotInstance => !!b),
  ];
  const groupRunning = (g: GroupChat) =>
    state.tasks.some((t) => t.groupId === g.id && t.state === "running");
  const groupWaiting = (g: GroupChat) => {
    const tasks = new Set(
      state.tasks.filter((t) => t.groupId === g.id).map((t) => t.id),
    );
    return pending.some((a) => tasks.has(a.taskId));
  };
  const botRow = (b: BotInstance, nested: boolean, role = b.role) => (
    <button
      key={b.id}
      className={`bot-row ${nested ? "nested" : ""} ${page === "chat" && !group && b.id === current.id ? "active" : ""}`}
      onClick={() => open(b)}
      onContextMenu={(e) => {
        e.preventDefault();
        setCategoryMenu(null);
        setBotMenu({ id: b.id, x: e.clientX, y: e.clientY });
      }}
    >
      <Avatar name={b.name} size={nested ? 30 : 34} />
      <span className="bot-text">
        <strong>{b.name}</strong>
        <small>{running(b) ? "Working…" : role}</small>
      </span>
      {(waiting(b) || running(b)) && (
        <span
          className={`unread ${running(b) ? "pulse" : ""}`}
          aria-label={running(b) ? "Working" : "Needs review"}
        />
      )}
    </button>
  );
  // Everything is created from the top + menu; headings only fold.
  const sectionHeading = (
    key: string,
    label: string,
    count: number,
    onContextMenu?: (e: MouseEvent) => void,
  ) => {
    const open = !folded.has(`section:${key}`);
    return (
      <h3>
        <button
          className="section-toggle"
          aria-expanded={open}
          onClick={() => toggleFold(`section:${key}`)}
          onContextMenu={onContextMenu}
        >
          {label}
          {!open && count > 0 && <span className="section-count">{count}</span>}
          <ChevronRight size={12} />
        </button>
      </h3>
    );
  };
  // Categories only group rows in the sidebar; bots outside one are Unassigned.
  const filed = new Set(state.categories.flatMap((f) => f.botIds));
  const unassigned = specialists.filter((b) => !filed.has(b.id));
  // Each category is a sidebar section like Unassigned; right-click its heading to edit it.
  const categorySection = (f: Category) => {
    const bots = f.botIds
      .map((id) => specialists.find((b) => b.id === id))
      .filter((b): b is BotInstance => !!b);
    const key = `category:${f.id}`;
    return (
      <section key={f.id} className="bot-group" aria-label={f.name}>
        {sectionHeading(key, f.name, bots.length, (e) => {
          e.preventDefault();
          setBotMenu(null);
          setCategoryMenu({ id: f.id, x: e.clientX, y: e.clientY });
        })}
        {!folded.has(`section:${key}`) && (
          <>
            {bots.map((b) => botRow(b, false))}
            {!bots.length && (
              <small className="bots-empty">
                Right-click a bot to move it here.
              </small>
            )}
          </>
        )}
      </section>
    );
  };
  const menuCategory = categoryMenu
    ? state.categories.find((f) => f.id === categoryMenu.id)
    : undefined;
  const menuBot = botMenu
    ? state.bots.find((b) => b.id === botMenu.id)
    : undefined;
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
        aria-label="Create"
        title="New chat, group chat, bot or category  ⌘N"
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
              className={`featured-bot ${page === "chat" && !group && current.id === main.id ? "active" : ""}`}
              onClick={() => open(main)}
              onContextMenu={(e) => {
                e.preventDefault();
                setBotMenu({ id: main.id, x: e.clientX, y: e.clientY });
              }}
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
          <section className="bot-group" aria-label="Group chats">
            {sectionHeading("groups", "Group chats", state.groups.length)}
            {!folded.has("section:groups") && !state.groups.length && (
              <small className="bots-empty">Start one from + at the top.</small>
            )}
            {!folded.has("section:groups") &&
              state.groups.map((g) => (
                <button
                  key={g.id}
                  className={`bot-row ${page === "chat" && group?.id === g.id ? "active" : ""}`}
                  onClick={() => openGroup(g)}
                >
                  <GroupAvatar names={faces(g)} size={34} />
                  <span className="bot-text">
                    <strong>{g.name}</strong>
                    <small>
                      {groupRunning(g)
                        ? "Working…"
                        : faces(g)
                            .map((b) => b.name)
                            .join(", ")}
                    </small>
                  </span>
                  {(groupWaiting(g) || groupRunning(g)) && (
                    <span
                      className={`unread ${groupRunning(g) ? "pulse" : ""}`}
                      aria-label={groupRunning(g) ? "Working" : "Needs review"}
                    />
                  )}
                </button>
              ))}
          </section>
          {state.categories.map(categorySection)}
          <section className="bot-group" aria-label="Unassigned">
            {sectionHeading("unassigned", "Unassigned", unassigned.length)}
            {!folded.has("section:unassigned") && (
              <>
                {unassigned.map((b) => botRow(b, false))}
                {!unassigned.length && (
                  <small className="bots-empty">
                    {specialists.length
                      ? "Every bot is in a category. New bots land here."
                      : "Create a bot or add one from Connect Apps."}
                  </small>
                )}
                <button
                  className="group-link"
                  onClick={() => setEditingCategory({})}
                >
                  New category
                  <Plus size={14} />
                </button>
              </>
            )}
          </section>
          <section className="bot-group compact">
            <button
              className={`group-link ${page === "activity" ? "active" : ""}`}
              onClick={() => setPage("activity")}
            >
              Activity
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
                    setSettings({ tab: "general" });
                    setMenu(false);
                  }}
                >
                  <Settings size={15} />
                  Settings
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMemoryBot(current.id);
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
        {page === "chat" && group && (
          <Chat
            key={group.id}
            bot={main}
            main
            group={group}
            state={state}
            onRefresh={refresh}
            onSettings={() => openSettings("general")}
            onEditGroup={() => setGrouping("edit")}
            onDeleteGroup={() =>
              void api("groups", { id: group.id }, "DELETE")
                .then(() => {
                  open(main);
                  return refresh();
                })
                .catch((e: Error) => setError(e.message))
            }
          />
        )}
        {page === "chat" && !group && (
          <Chat
            key={current.id}
            bot={current}
            main={current.id === main.id}
            state={state}
            onRefresh={refresh}
            onSettings={openSettings}
          />
        )}
        {page === "new" && (
          <NewChat
            bots={[main, ...specialists]}
            groups={state.groups.map((g) => ({ group: g, faces: faces(g) }))}
            mainId={main.id}
            onClose={() => setPage("chat")}
            onPick={open}
            onPickGroup={openGroup}
            onCreateGroup={() => {
              setPage("chat");
              setGrouping("new");
            }}
            onCreate={() => {
              setPage("chat");
              setCreating(true);
            }}
            onCreateCategory={() => {
              setPage("chat");
              setEditingCategory({});
            }}
          />
        )}
        {page === "activity" && (
          <div className="page-frame">
            <header className="page-bar drag">
              <span>Activity</span>
              <button
                className="icon ghost"
                aria-label="Close"
                onClick={() => setPage("chat")}
              >
                <X size={17} />
              </button>
            </header>
            <ActivityView events={state.activity} />
          </div>
        )}
      </main>
      {memoryBot && (
        <MemoryView
          botId={memoryBot}
          bots={state.bots}
          onSelect={setMemoryBot}
          onClose={() => setMemoryBot(null)}
        />
      )}
      {settings && (
        <SettingsDialog
          state={state}
          onRefresh={refresh}
          onClose={() => setSettings(null)}
          onOpenActivity={() => {
            setSettings(null);
            setPage("activity");
          }}
          initialTab={settings.tab}
          initialConnection={settings.connectionId}
          theme={theme}
          onTheme={setTheme}
        />
      )}
      {apps && (
        <ConnectApps
          state={state}
          onRefresh={refresh}
          onClose={() => setApps(false)}
        />
      )}
      {botMenu && menuBot && (
        <BotMenu
          bot={menuBot}
          x={botMenu.x}
          y={botMenu.y}
          onClose={() => setBotMenu(null)}
          onChat={() => {
            open(menuBot);
            setBotMenu(null);
          }}
          onMemory={() => {
            setMemoryBot(menuBot.id);
            setBotMenu(null);
          }}
          onRefresh={refresh}
          {...(menuBot.id === main.id ? {} : { categories: state.categories })}
        />
      )}
      {categoryMenu && menuCategory && (
        <CategoryMenu
          category={menuCategory}
          x={categoryMenu.x}
          y={categoryMenu.y}
          onClose={() => setCategoryMenu(null)}
          onEdit={() => {
            setEditingCategory({ category: menuCategory });
            setCategoryMenu(null);
          }}
          onRefresh={refresh}
        />
      )}
      {editingCategory && (
        <EditCategory
          specialists={specialists}
          categories={state.categories}
          {...(editingCategory.category
            ? { category: editingCategory.category }
            : {})}
          onClose={() => setEditingCategory(null)}
          onSaved={() => void refresh()}
        />
      )}
      {grouping && (
        <CreateGroup
          lead={main}
          specialists={specialists}
          {...(grouping === "edit" && group ? { group } : {})}
          onClose={() => setGrouping(null)}
          onSaved={(g) => {
            openGroup(g);
            void refresh();
          }}
          onCreateBot={() => {
            setGrouping(null);
            setCreating(true);
          }}
        />
      )}
      {creating && (
        <CreateBot
          onClose={() => setCreating(false)}
          onCreated={(b) => {
            void refresh();
            setSelected(b.id);
            setPage("chat");
          }}
        />
      )}
    </div>
  );
}
