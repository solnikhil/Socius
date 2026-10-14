import { useState } from "react";
import {
  BookOpen,
  Check,
  FileText,
  Globe,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Manifest } from "@socius/contracts";
import type { InstallPreview, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, Modal, ErrorNote } from "../components/ui.js";

export function Marketplace({
  state,
  onRefresh,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"skill" | "bot">("skill"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [preview, setPreview] = useState<{
      item: Manifest;
      plan: InstallPreview;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const items = state.catalog.filter(
    (p) =>
      (tab === "bot" ? p.kind === "bot" : p.kind !== "bot") &&
      (filter === "all" || p.kind === filter) &&
      (p.name + " " + p.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
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
  return (
    <section className="page marketplace">
      <div className="eyebrow">MAKE SOCIUS YOUR OWN</div>
      <h1>A new capability. A new teammate.</h1>
      <p className="subtitle">
        Give your ally the skills and specialists your work needs.
      </p>
      <div className="market-toolbar">
        <div className="tabs">
          <button
            className={tab === "skill" ? "selected" : ""}
            onClick={() => {
              setTab("skill");
              setFilter("all");
            }}
          >
            Skills & Connectors
          </button>
          <button
            className={tab === "bot" ? "selected" : ""}
            onClick={() => {
              setTab("bot");
              setFilter("all");
            }}
          >
            Bots
          </button>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search marketplace"
            placeholder="Find a capability…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {tab === "skill" && (
        <div className="filters">
          {["all", "skill", "connector"].map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "skill" ? "Skills" : "Connectors"}
            </button>
          ))}
        </div>
      )}
      <ErrorNote error={error} />
      <div className="catalog-grid">
        {items.map((item) => {
          const installed = state.installations.some(
            (i) => i.id === item.id && i.version === item.version,
          );
          return (
            <article className="catalog-card" key={item.id}>
              <div className="card-top">
                {item.kind === "bot" ? (
                  <Avatar name={item.name} large />
                ) : (
                  <span
                    className={`cap-icon ${item.kind === "connector" ? "purple" : ""}`}
                  >
                    {item.kind === "connector" ? (
                      <Globe size={25} />
                    ) : item.id.includes("summary") ? (
                      <FileText size={25} />
                    ) : (
                      <BookOpen size={25} />
                    )}
                  </span>
                )}
                <span className="type-badge">{item.kind}</span>
              </div>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
              <div className="card-bottom">
                <span>By {item.publisher}</span>
                <button onClick={() => void inspect(item)}>
                  {item.kind === "connector"
                    ? "Details"
                    : item.kind === "bot"
                      ? "Add bot"
                      : installed
                        ? "Installed"
                        : "Install"}
                  {installed && item.kind === "skill" ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {items.length === 0 && (
        <div className="empty">
          <Search />
          <h2>No matching packages</h2>
          <p>Try a different search or filter.</p>
        </div>
      )}
      <div className="registry-note">
        <ShieldCheck size={17} />
        <span>
          Curated local catalog. Packages do not run code or grant permissions
          on install.
        </span>
      </div>
      {preview && (
        <Modal
          title={preview.item.name}
          onClose={() => {
            setPreview(null);
            setError("");
          }}
        >
          <p>{preview.item.description}</p>
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
          {preview.item.kind !== "connector" && (
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
              <Plus size={16} />
            </button>
          )}
        </Modal>
      )}
    </section>
  );
}
