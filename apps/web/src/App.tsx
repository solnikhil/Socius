import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ChevronRight,
  Monitor,
  Moon,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Settings,
  Sun,
  User,
  X,
} from "lucide-react";
import type { BotInstance, BotManifest } from "@socius/contracts";
import type { Category, GroupChat, Snapshot } from "@socius/contracts/app";
import { api } from "./api.js";
import {
  Avatar,
  ErrorNote,
  GroupAvatar,
  MAIN_BOT_TEMPLATE,
  useTheme,
  type ThemePreference,
} from "./components/chrome.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    [editingCategory, setEditingCategory] = useState<{
      category?: Category;
    } | null>(null),
    [apps, setApps] = useState(false),
    [collapsed, setCollapsed] = useState(false),
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
  const layoutOf = (id: string) => state.layouts.find((l) => l.botId === id);
  const open = (b: BotInstance) => {
    setSelected(b.id);
    setGroupId("");
    setPage("chat");
    if (layoutOf(b.id)?.unread)
      void api("bots/layout", { botId: b.id, unread: false }).then(() =>
        refresh(),
      );
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
  const pinnedFirst = (bots: BotInstance[]) =>
    [...bots].sort(
      (a, b) =>
        Number(!!layoutOf(b.id)?.pinned) - Number(!!layoutOf(a.id)?.pinned),
    );
  const botRow = (b: BotInstance, nested: boolean, role = b.role) => {
    const flagged = running(b) || waiting(b) || !!layoutOf(b.id)?.unread;
    return (
      <BotMenu
        key={b.id}
        bot={b}
        main={false}
        layout={layoutOf(b.id)}
        categories={state.categories}
        onRefresh={refresh}
      >
        <button
          className={`bot-row ${nested ? "nested" : ""} ${page === "chat" && !group && b.id === current.id ? "active" : ""}`}
          onClick={() => open(b)}
        >
          <Avatar name={b.name} size={nested ? 30 : 34} />
          <span className="bot-text">
            <strong>{b.name}</strong>
            <small>{running(b) ? "Working…" : role}</small>
          </span>
          {(layoutOf(b.id)?.pinned || flagged) && (
            <span className="row-flags">
              {layoutOf(b.id)?.pinned && (
                <span className="pin-mark" aria-label="Pinned">
                  <Pin size={13} />
                </span>
              )}
              {flagged && (
                <span
                  className={`unread ${running(b) ? "pulse" : ""}`}
                  aria-label={
                    running(b)
                      ? "Working"
                      : waiting(b)
                        ? "Needs review"
                        : "Unread"
                  }
                />
              )}
            </span>
          )}
        </button>
      </BotMenu>
    );
  };
  // Everything is created from the top + menu; headings only fold.
  const sectionHeading = (
    key: string,
    label: string,
    count: number,
    wrap?: (button: ReactNode) => ReactNode,
  ) => {
    const open = !folded.has(`section:${key}`);
    const button = (
      <button
        className="section-toggle"
        aria-expanded={open}
        onClick={() => toggleFold(`section:${key}`)}
      >
        {label}
        {!open && count > 0 && <span className="section-count">{count}</span>}
        <ChevronRight size={12} />
      </button>
    );
    return <h3>{wrap ? wrap(button) : button}</h3>;
  };
  // Categories only group rows in the sidebar; bots outside one are Unassigned.
  const filed = new Set(state.categories.flatMap((f) => f.botIds));
  const hiddenBot = (b: BotInstance) => !!layoutOf(b.id)?.hidden;
  const unassigned = pinnedFirst(
    specialists.filter((b) => !filed.has(b.id) && !hiddenBot(b)),
  );
  const hiddenBots = pinnedFirst(state.bots.filter(hiddenBot));
  // Each category is a sidebar section like Unassigned; right-click its heading to edit it.
  const categorySection = (f: Category) => {
    const bots = pinnedFirst(
      f.botIds
        .map((id) => specialists.find((b) => b.id === id))
        .filter((b): b is BotInstance => !!b && !layoutOf(b.id)?.hidden),
    );
    const key = `category:${f.id}`;
    return (
      <section key={f.id} className="bot-group" aria-label={f.name}>
        {sectionHeading(key, f.name, bots.length, (button) => (
          <CategoryMenu
            category={f}
            onRefresh={refresh}
            onEdit={() => setEditingCategory({ category: f })}
          >
            {button}
          </CategoryMenu>
        ))}
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
  const connected = state.catalog.filter((p) =>
    state.installations.some((i) => i.id === p.id && p.kind !== "bot"),
  );

  const tip = (label: string, control: ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  const toolbar = (
    <div className="window-tools">
      {tip(
        "Hide sidebar  ⌘\\",
        <button
          className="icon ghost"
          aria-label="Hide sidebar"
          onClick={() => setCollapsed((c) => !c)}
        >
          <PanelLeft size={17} />
        </button>,
      )}
      {tip(
        "Search  ⌘K",
        <button
          className="icon round"
          aria-label="Search bots"
          onClick={() => setPage("new")}
        >
          <Search size={17} />
        </button>,
      )}
      {tip(
        "New chat, group chat, bot or category  ⌘N",
        <button
          className="icon round"
          aria-label="Create"
          onClick={() => setPage("new")}
        >
          <Plus size={19} />
        </button>,
      )}
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
          {!hiddenBot(main) && (
            <div className="featured">
              <BotMenu
                bot={main}
                main
                layout={layoutOf(main.id)}
                categories={state.categories}
                onRefresh={refresh}
              >
              <button
                className={`featured-bot ${page === "chat" && !group && current.id === main.id ? "active" : ""}`}
                onClick={() => open(main)}
              >
                <Avatar name={main.name} main size={66} badge />
                <span>{main.name}</span>
                {(running(main) ||
                  waiting(main) ||
                  !!layoutOf(main.id)?.unread) && (
                  <span
                    className={`review-dot ${running(main) ? "pulse" : ""}`}
                    aria-label={
                      running(main)
                        ? "Working"
                        : waiting(main)
                          ? "Needs review"
                          : "Unread"
                    }
                  />
                )}
              </button>
              </BotMenu>
            </div>
          )}
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
                    {specialists.some((b) => !hiddenBot(b))
                      ? "Every bot is in a category. New bots land here."
                      : "Create a bot or add one from Connect Apps."}
                  </small>
                )}
              </>
            )}
          </section>
          {hiddenBots.length > 0 && (
            <section className="bot-group" aria-label="Hidden bots">
              {sectionHeading("hidden", "Hidden bots", hiddenBots.length)}
              {!folded.has("section:hidden") &&
                hiddenBots.map((b) => botRow(b, false))}
            </section>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="account">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="account-button"
                  aria-label="Account and settings"
                >
                  <User size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="menu-panel account-panel"
              >
                <DropdownMenuItem
                  onSelect={() => setSettings({ tab: "general" })}
                >
                  <Settings size={15} />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setMemoryBot(current.id)}>
                  <BookOpen size={15} />
                  Memory
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPage("activity")}>
                  <Activity size={15} />
                  Activity
                </DropdownMenuItem>
                <DropdownMenuSeparator className="menu-divider" />
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
              </DropdownMenuContent>
            </DropdownMenu>
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
        {tip(
          "Show sidebar  ⌘\\",
          <button
            className="sidebar-reveal icon ghost"
            aria-label="Show sidebar"
            tabIndex={collapsed ? 0 : -1}
            aria-hidden={!collapsed}
            onClick={() => setCollapsed(false)}
          >
            <PanelLeft size={17} />
          </button>,
        )}
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
          templates={state.catalog.filter(
            (m): m is BotManifest => m.kind === "bot" && !!m.category,
          )}
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
