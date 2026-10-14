import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Manifest } from "@socius/contracts";
import type { InstallPreview, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import {
  Avatar,
  closeOnBackdrop,
  ErrorNote,
  MAIN_BOT_TEMPLATE,
  Modal,
} from "../components/ui.js";
import { AppIcon } from "../components/AppIcon.js";

type Filter = "all" | Manifest["kind"] | "added";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "connector", label: "Connectors" },
  { value: "bot", label: "Bots" },
];
const sectionTitle: Record<Manifest["kind"], string> = {
  skill: "Skills",
  connector: "Connectors",
  bot: "Bot templates",
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
  const [filter, setFilter] = useState<Filter>("all"),
    [query, setQuery] = useState(""),
    [preview, setPreview] = useState<{
      item: Manifest;
      plan: InstallPreview;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const installed = (item: Manifest) =>
    item.kind !== "bot" &&
    state.installations.some(
      (i) => i.id === item.id && i.version === item.version,
    );
  const q = query.trim().toLowerCase();
  const matches = state.catalog.filter((p) =>
    `${p.name} ${p.description} ${p.publisher}`.toLowerCase().includes(q),
  );
  const added = state.catalog.filter(installed);
  async function inspect(item: Manifest) {
    try {
      setError("");
      setPreview({
        item,
        plan: await api<InstallPreview>("install/preview", {
          id: item.id,
          version: item.version,
        }),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function install() {
    if (!preview) return;
    setBusy(true);
    try {
      await api("install", {
        id: preview.item.id,
        version: preview.item.version,
        digest: preview.plan.digest,
      });
      await onRefresh();
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const row = (item: Manifest) => (
    <article className="app-row" key={item.id}>
      <AppIcon item={item} />
      <div>
        <h4>{item.name}</h4>
        <p>{item.description}</p>
      </div>
      {installed(item) ? (
        <button className="added" onClick={() => void inspect(item)}>
          <Check size={14} />
          Added
        </button>
      ) : (
        <button className="pill" onClick={() => void inspect(item)}>
          {item.kind === "connector" ? "Connect" : "Add"}
        </button>
      )}
    </article>
  );
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
  return (
    <dialog
      ref={ref}
      className="connect-apps-dialog"
      aria-labelledby="connect-apps-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!preview) onClose();
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
            placeholder="Search across apps and skills"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="pill" onClick={() => setFilter("bot")}>
          <Avatar name="Socius" main size={18} />
          Bot templates
          <ArrowUpRight size={14} />
        </button>
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
      <ErrorNote error={preview ? "" : error} />
      <div className="connect-body">
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
          section(
            "Connected",
            added.filter((p) => matches.includes(p)),
          )
        ) : (
          section(
            sectionTitle[filter],
            matches.filter((p) => p.kind === filter),
          )
        )}
        {(filter === "added"
          ? added.filter((p) => matches.includes(p))
          : matches.filter((p) => filter === "all" || p.kind === filter)
        ).length === 0 && (
          <div className="empty">
            <Search size={22} />
            <p>
              {filter === "added"
                ? "Nothing connected yet."
                : "No apps or skills match your search."}
            </p>
          </div>
        )}
        <div className="registry-note">
          <ShieldCheck size={15} />
          Curated local catalog. Packages do not run code or grant permissions
          on install.
        </div>
      </div>
      {preview && (
        <Modal
          title={preview.item.name}
          className="install-dialog"
          onClose={() => {
            setPreview(null);
            setError("");
          }}
        >
          <div className="install-hero">
            <AppIcon item={preview.item} size={52} />
            <p>{preview.item.description}</p>
          </div>
          <div className="detail-list">
            <div>
              <span>Publisher</span>
              <strong>{preview.item.publisher}</strong>
            </div>
            <div>
              <span>Version</span>
              <strong>{preview.item.version}</strong>
            </div>
            <div>
              <span>Dependencies</span>
              <strong>{preview.plan.packages.length - 1}</strong>
            </div>
            <div>
              <span>Requested capabilities</span>
              <strong>
                {preview.plan.requestedCapabilities.join(", ") || "None"}
              </strong>
            </div>
          </div>
          <p className="muted">
            {preview.item.kind === "bot"
              ? "Creates a fresh private bot. No credentials, memories or permissions transfer."
              : preview.item.kind === "connector"
                ? "This connector is listed for the integration workstream. Setup and tool execution are not available yet."
                : "Installs an instruction-only skill, available to your bots. It does not add executable tools."}
          </p>
          <ErrorNote error={error} />
          <div className="modal-actions">
            {preview.item.kind !== "connector" && !installed(preview.item) && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void install()}
              >
                {busy
                  ? "Installing…"
                  : preview.item.kind === "bot"
                    ? "Add bot"
                    : "Install skill"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </dialog>
  );
}
