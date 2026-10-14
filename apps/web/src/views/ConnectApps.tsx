import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FolderUp,
  FileUp,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Manifest } from "@socius/contracts";
import type { RegistryPage, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import {
  Avatar,
  closeOnBackdrop,
  ErrorNote,
  MAIN_BOT_TEMPLATE,
} from "../components/ui.js";
import { AppIcon } from "../components/AppIcon.js";
import { connectorStatus, PackageDetail } from "./PackageDetail.js";

type Filter = "all" | Manifest["kind"] | "added" | "registry";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "connector", label: "Connectors" },
  { value: "bot", label: "Bots" },
  { value: "registry", label: "MCP Registry" },
];
const sectionTitle: Record<Manifest["kind"], string> = {
  skill: "Skills",
  connector: "Connectors",
  bot: "Bot templates",
};
const versionKey = (v: string) =>
  v.split(".").reduce((n, part) => n * 10000 + Number(part), 0);
const toBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

export function ConnectApps({
  state,
  onRefresh,
  onClose,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const template = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all"),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<{ id: string; version: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // One row per package: the installed release, or the newest compatible one.
  const latest = new Map<string, Manifest>();
  for (const r of state.releases) {
    const current = latest.get(r.manifest.id);
    if (!r.compatible) continue;
    if (
      !current ||
      versionKey(r.manifest.version) > versionKey(current.version)
    )
      latest.set(r.manifest.id, r.manifest);
  }
  const catalog = [...latest.values()];
  const receipt = (item: Manifest) =>
    state.installations.find((i) => i.id === item.id);
  const installed = (item: Manifest) => item.kind !== "bot" && !!receipt(item);
  const q = query.trim().toLowerCase();
  const matches = catalog.filter((p) =>
    `${p.name} ${p.description} ${p.publisher}`.toLowerCase().includes(q),
  );
  const added = catalog.filter(installed);
  const selected = detail
    ? state.releases.find(
        (r) =>
          r.manifest.id === detail.id && r.manifest.version === detail.version,
      )?.manifest
    : undefined;

  async function importFolder(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setNotice("");
    try {
      const entries = await Promise.all(
        [...files].map(async (f) => ({
          path: f.webkitRelativePath || f.name,
          content: toBase64(await f.arrayBuffer()),
        })),
      );
      const result = await api<{
        release: { manifest: Manifest };
        ignored: string[];
      }>("skills/import", {
        label: entries[0]!.path.split("/")[0] ?? "Local folder",
        files: entries,
      });
      await onRefresh();
      setNotice(
        `Imported ${result.release.manifest.name} for review${result.ignored.length ? ` (ignored ${result.ignored.length} hidden files)` : ""}.`,
      );
      setDetail({
        id: result.release.manifest.id,
        version: result.release.manifest.version,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (folder.current) folder.current.value = "";
    }
  }
  async function importTemplate(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError("");
    try {
      const manifest = JSON.parse(await file.text());
      const result = await api<{ release: { manifest: Manifest } }>(
        "templates/import",
        {
          label: file.name,
          manifest,
        },
      );
      await onRefresh();
      setDetail({
        id: result.release.manifest.id,
        version: result.release.manifest.version,
      });
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "That file is not valid JSON"
          : (e as Error).message,
      );
    } finally {
      if (template.current) template.current.value = "";
    }
  }

  const row = (item: Manifest) => {
    const r = receipt(item);
    const status =
      item.kind === "connector" && r ? connectorStatus(state, item.id) : null;
    return (
      <article className="app-row" key={item.id}>
        <AppIcon item={item} />
        <div>
          <h4>{item.name}</h4>
          <p>
            {status
              ? `${status.label} · ${item.description}`
              : item.description}
          </p>
        </div>
        {installed(item) ? (
          <button
            className="added"
            onClick={() => setDetail({ id: item.id, version: item.version })}
          >
            {r && r.version !== item.version ? (
              "Update"
            ) : (
              <>
                <Check size={14} />
                {r?.enabled === false
                  ? "Disabled"
                  : status?.status === "ready" || !status
                    ? "Added"
                    : "Set up"}
              </>
            )}
          </button>
        ) : (
          <button
            className="pill"
            onClick={() => setDetail({ id: item.id, version: item.version })}
          >
            {item.kind === "connector" ? "Connect" : "Add"}
          </button>
        )}
      </article>
    );
  };
  const section = (title: string, items: Manifest[], more?: Filter) =>
    items.length > 0 && (
      <section className="app-section" key={title}>
        <div className="app-section-head">
          <h3>{title}</h3>
          {more && filter === "all" && (
            <button className="text-button" onClick={() => setFilter(more)}>
              View all
            </button>
          )}
        </div>
        <div className="app-grid">{items.map(row)}</div>
      </section>
    );
  const recommended = matches.filter(
    (p) =>
      !installed(p) && p.kind !== "connector" && p.id !== MAIN_BOT_TEMPLATE,
  );
  const visible =
    filter === "added"
      ? added.filter((p) => matches.includes(p))
      : matches.filter((p) => filter === "all" || p.kind === filter);
  return (
    <dialog
      ref={ref}
      className="connect-apps-dialog"
      aria-labelledby="connect-apps-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!detail) onClose();
      }}
      onClick={(e) => closeOnBackdrop(e, onClose)}
    >
      <button
        className="icon ghost dialog-close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <header className="connect-head">
        <h2 id="connect-apps-title">Connect Apps</h2>
        <button
          className="connected-count"
          onClick={() => setFilter(filter === "added" ? "all" : "added")}
        >
          <span className="app-stack">
            {added.slice(0, 4).map((p) => (
              <AppIcon key={p.id} item={p} size={20} />
            ))}
          </span>
          {added.length} connected
          <ChevronRight size={14} />
        </button>
      </header>
      <div className="connect-search">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search apps and skills"
            placeholder={
              filter === "registry"
                ? "Search the MCP Registry"
                : "Search across apps and skills"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="pill" onClick={() => folder.current?.click()}>
          <FolderUp size={15} />
          Import skill
        </button>
        <button className="pill" onClick={() => template.current?.click()}>
          <FileUp size={15} />
          Import template
        </button>
        <button className="pill" onClick={() => setFilter("bot")}>
          <Avatar name="Socius" main size={18} />
          Bot templates
          <ArrowUpRight size={14} />
        </button>
        <input
          ref={folder}
          type="file"
          hidden
          multiple
          aria-label="Skill folder"
          {...{ webkitdirectory: "" }}
          onChange={(e) => void importFolder(e.target.files)}
        />
        <input
          ref={template}
          type="file"
          hidden
          accept=".json,application/json"
          aria-label="Bot template file"
          onChange={(e) => void importTemplate(e.target.files)}
        />
      </div>
      <div className="chips" role="tablist" aria-label="Categories">
        {filters.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            className={filter === f.value ? "selected" : ""}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ErrorNote error={detail ? "" : error} />
      {notice && !detail && (
        <div className="saved connect-notice" role="status">
          {notice}
        </div>
      )}
      <div className="connect-body">
        {filter === "registry" ? (
          <RegistryBrowser
            query={q}
            state={state}
            onOpen={(id) => {
              const m = latest.get(id);
              if (m) setDetail({ id: m.id, version: m.version });
            }}
          />
        ) : (
          <>
            {filter === "all" ? (
              <>
                {!q && section("Recommended for you", recommended.slice(0, 6))}
                {(["skill", "connector", "bot"] as const).map((kind) =>
                  section(
                    sectionTitle[kind],
                    matches.filter((p) => p.kind === kind),
                    kind,
                  ),
                )}
              </>
            ) : filter === "added" ? (
              section("Connected", visible)
            ) : (
              section(sectionTitle[filter], visible)
            )}
            {visible.length === 0 && (
              <div className="empty">
                <Search size={22} />
                <p>
                  {filter === "added"
                    ? "Nothing connected yet."
                    : "No apps or skills match your search."}
                </p>
              </div>
            )}
          </>
        )}
        <div className="registry-note">
          <ShieldCheck size={15} />
          Packages never run code on install and grant no permissions by
          themselves. Imported skills stay instruction-only.
        </div>
      </div>
      {selected && (
        <PackageDetail
          key={`${selected.id}@${selected.version}`}
          item={selected}
          state={state}
          onRefresh={onRefresh}
          onClose={() => {
            setDetail(null);
            setError("");
          }}
        />
      )}
    </dialog>
  );
}

/** Metadata-only discovery: listing never launches or connects to a server. */
function RegistryBrowser({
  query,
  state,
  onOpen,
}: {
  query: string;
  state: Snapshot;
  onOpen: (connectorId: string) => void;
}) {
  const [page, setPage] = useState<RegistryPage | null>(null),
    [paging, setPaging] = useState({ query, cursor: "" }),
    [loading, setLoading] = useState(false);
  const cursor = paging.query === query ? paging.cursor : "";
  const setCursor = (next: string) => setPaging({ query, cursor: next });
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      api<RegistryPage>(
        `registry?search=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}`,
      )
        .then(setPage)
        .catch((e) =>
          setPage({
            servers: [],
            nextCursor: null,
            fetchedAt: new Date().toISOString(),
            stale: false,
            skipped: 0,
            error: (e as Error).message,
          }),
        )
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, cursor]);
  return (
    <section className="app-section registry">
      <div className="app-section-head">
        <h3>Official MCP Registry</h3>
        {page?.stale && <span className="muted">Showing saved results</span>}
      </div>
      {loading && !page && <p className="muted">Loading registry…</p>}
      {page?.error && (
        <div className="error" role="alert">
          {page.error}
        </div>
      )}
      <div className="registry-list">
        {page?.servers.map((s) => (
          <article key={`${s.name}@${s.version}`} className="registry-row">
            <div>
              <h4>
                {s.name} <small>{s.version}</small>
              </h4>
              <p>{s.description}</p>
              <small className="muted">
                {s.remotes.length
                  ? `Remote: ${s.remotes.map((r) => r.type).join(", ")}`
                  : s.packages.length
                    ? `Local package: ${s.packages.map((p) => p.registryType).join(", ")}`
                    : "No endpoint listed"}{" "}
                · {s.reviewNote}
              </small>
            </div>
            {s.reviewedConnectorId ? (
              <button
                className="pill"
                onClick={() => onOpen(s.reviewedConnectorId!)}
              >
                {state.installations.some((i) => i.id === s.reviewedConnectorId)
                  ? "Open"
                  : "Review"}
              </button>
            ) : (
              <span className="unreviewed">Not reviewed</span>
            )}
          </article>
        ))}
      </div>
      {page && page.servers.length === 0 && !page.error && (
        <p className="muted">No servers match.</p>
      )}
      <div className="modal-actions">
        {cursor && <button onClick={() => setCursor("")}>First page</button>}
        {page?.nextCursor && (
          <button onClick={() => setCursor(page.nextCursor!)}>Next page</button>
        )}
      </div>
    </section>
  );
}
