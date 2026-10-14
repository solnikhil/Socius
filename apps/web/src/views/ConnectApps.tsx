import {
  connectorCategories,
  plannedConnectors,
  type PlannedConnector,
} from "@socius/marketplace/connector-directory";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileUp,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Manifest } from "@socius/contracts";
import type { RegistryPage, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, ErrorNote, useDialogMotion } from "../components/chrome.js";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AppIcon } from "../components/AppIcon.js";
import { connectorStatus, PackageDetail } from "./PackageDetail.js";

type Filter = "all" | Manifest["kind"] | "added" | "registry";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "connector", label: "Connectors" },
  { value: "bot", label: "Bots" },
  { value: "registry", label: "MCP Registry" },
];
const indiaRegistry = [
  { label: "India", value: "india" },
  { label: "Razorpay", value: "razorpay" },
  { label: "Cashfree", value: "cashfree" },
  { label: "Zoho", value: "zoho" },
  { label: "Rail", value: "irctc" },
];
const versionKey = (v: string) =>
  v.split(".").reduce((n, part) => n * 10000 + Number(part), 0);

export function ConnectApps({
  state,
  onRefresh,
  onClose,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const template = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all"),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<{ id: string; version: string } | null>(
      null,
    ),
    [error, setError] = useState("");
  const motion = useDialogMotion(onClose);
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
  const matches = catalog.filter(
    (p) =>
      p.kind !== "skill" &&
      `${p.name} ${p.description} ${p.publisher}`.toLowerCase().includes(q),
  );
  const plannedMatches = plannedConnectors.filter(
    (item) =>
      !latest.has(item.id) &&
      `${item.name} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(q),
  );
  const added = catalog.filter(installed);
  const selected = detail
    ? state.releases.find(
        (r) =>
          r.manifest.id === detail.id && r.manifest.version === detail.version,
      )?.manifest
    : undefined;

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
  const plannedRow = (item: PlannedConnector) => (
    <article className="app-row" key={item.id}>
      <AppIcon item={item} />
      <div>
        <h4>{item.name}</h4>
        <p>
          {item.description} Integration planned; account connection is not
          available yet.
        </p>
      </div>
      <button className="pill" disabled aria-label={`${item.name}: planned`}>
        Planned
      </button>
    </article>
  );
  const section = (title: string, items: Manifest[], more?: Filter) => {
    const shown = filter === "all" && more ? items.slice(0, 4) : items;
    return (
      shown.length > 0 && (
        <section className="app-section" key={title}>
          <div className="app-section-head">
            <h3>{title}</h3>
            {more && shown.length < items.length && (
              <button className="text-button" onClick={() => setFilter(more)}>
                View all
              </button>
            )}
          </div>
          <div className="app-grid">{shown.map(row)}</div>
        </section>
      )
    );
  };
  const connectors = matches.filter((p) => p.kind === "connector");
  const bots = matches.filter((p) => p.kind === "bot");
  const visible =
    filter === "added"
      ? added.filter((p) => matches.includes(p))
      : matches.filter((p) => filter === "all" || p.kind === filter);
  return (
    <Dialog modal={false} open={motion.open} onOpenChange={motion.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dialog-surface connect-apps-dialog"
        aria-labelledby="connect-apps-title"
        onAnimationEnd={motion.onAnimationEnd}
        onInteractOutside={motion.onInteractOutside}
        onEscapeKeyDown={(e) => {
          if (detail) e.preventDefault();
        }}
      >
      <header className="connect-head">
        <div>
          <DialogTitle id="connect-apps-title">Connect Apps</DialogTitle>
          <p>Connectors and bot templates for this workspace.</p>
        </div>
        <div className="connect-head-actions">
          <button
            className="connected-count"
            onClick={() => setFilter(filter === "added" ? "all" : "added")}
          >
            <span className="app-stack">
              {added.slice(0, 4).map((p) => (
                <AppIcon key={p.id} item={p} size={18} />
              ))}
            </span>
            {added.length} connected
            <ChevronRight size={14} />
          </button>
          <button
            className="icon ghost"
            aria-label="Close dialog"
            onClick={motion.requestClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="connect-toolbar">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search apps"
            placeholder={
              filter === "registry"
                ? "Search the MCP Registry"
                : "Search connectors and templates"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="connect-toolbar-row">
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
          <div className="connect-imports">
            <button className="pill" onClick={() => template.current?.click()}>
              <FileUp size={15} />
              Import template
            </button>
            <button className="pill" onClick={() => setFilter("bot")}>
              <Avatar name="Socius" main size={18} />
              Bot templates
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        <input
          ref={template}
          type="file"
          hidden
          accept=".json,application/json"
          aria-label="Bot template file"
          onChange={(e) => void importTemplate(e.target.files)}
        />
      </div>
      <ErrorNote error={detail ? "" : error} />
      <div className="connect-body">
        {filter === "registry" ? (
          <RegistryBrowser
            query={q}
            state={state}
            onSearch={setQuery}
            onOpen={(id) => {
              const m = latest.get(id);
              if (m) setDetail({ id: m.id, version: m.version });
            }}
          />
        ) : (
          <>
            {filter === "added" && section("Connected", visible)}
            {(filter === "all" || filter === "connector") &&
              (connectors.length > 0 || plannedMatches.length > 0) &&
              (filter === "connector" ? (
                <>
                  {section("Ready to connect", connectors)}
                  {connectorCategories.map((category) => {
                    const items = plannedMatches.filter(
                      (item) => item.category === category.id,
                    );
                    if (!items.length) return null;
                    return (
                      <section className="app-section" key={category.id}>
                        <div className="app-section-head">
                          <h3>{category.title}</h3>
                        </div>
                        <div className="app-grid">{items.map(plannedRow)}</div>
                      </section>
                    );
                  })}
                </>
              ) : (
                <section className="app-section">
                  <div className="app-section-head">
                    <h3>Connectors</h3>
                    {(connectors.length > 0 || plannedMatches.length > 4) && (
                      <button
                        className="text-button"
                        onClick={() => setFilter("connector")}
                      >
                        View all
                      </button>
                    )}
                  </div>
                  <div className="app-grid">
                    {connectors.map(row)}
                    {plannedMatches.slice(0, 4).map(plannedRow)}
                  </div>
                </section>
              ))}
            {filter === "all" && section("Bot templates", bots, "bot")}
            {filter === "bot" && section("Bot templates", bots)}
            {(filter === "added"
              ? visible.length === 0
              : visible.length === 0 && plannedMatches.length === 0) && (
                <div className="empty">
                  <Search size={22} />
                  <p>
                    {filter === "added"
                      ? "Nothing connected yet."
                      : "No connectors or templates match your search."}
                  </p>
                </div>
              )}
          </>
        )}
        <div className="registry-note">
          <ShieldCheck size={15} />
          Packages never run code on install and grant no permissions by
          themselves.
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
      </DialogContent>
    </Dialog>
  );
}

/** Metadata-only discovery: listing never launches or connects to a server. */
function RegistryBrowser({
  query,
  state,
  onSearch,
  onOpen,
}: {
  query: string;
  state: Snapshot;
  onSearch: (query: string) => void;
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
      <div className="chips registry-suggestions" aria-label="Indian services">
        {indiaRegistry.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={query === item.value}
            onClick={() => onSearch(query === item.value ? "" : item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="registry-hint">
        Indian services from the official registry. Socius can connect a server
        only after that exact release is reviewed. Everything else stays
        discovery-only.
      </p>
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
