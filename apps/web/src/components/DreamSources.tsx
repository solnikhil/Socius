import { useState } from "react";
import { api } from "../api.js";
import { ErrorNote } from "./chrome.js";
interface Source {
  id: string;
  content: string | null;
  createdAt: string | null;
}
/** Evidence is fetched only when expanded and remains scoped to the selected bot. */
export function DreamSources({
  botId,
  runId,
  memoryId,
}: {
  botId: string;
  runId?: string;
  memoryId?: string;
}) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      setSources(
        await api<Source[]>(
          `dreaming/sources?${new URLSearchParams({ botId, ...(runId ? { runId } : { memoryId: memoryId! }) })}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Source messages</summary>
      {loading && <p role="status">Loading sources…</p>}
      <ErrorNote error={error} />
      {error && (
        <button type="button" onClick={() => void load()}>
          Retry sources
        </button>
      )}
      {sources?.map((s) => (
        <blockquote key={s.id}>
          <p>{s.content ?? "This source message is no longer available."}</p>
          {s.createdAt && (
            <small>{new Date(s.createdAt).toLocaleString()}</small>
          )}
        </blockquote>
      ))}
    </details>
  );
}
