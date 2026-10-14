import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import type { Approval, BotDraft } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote } from "./ui.js";

export function ApprovalCard({
  approval: a,
  onRefresh,
}: {
  approval: Approval;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function resolve(approve: boolean) {
    setBusy(true);
    try {
      await api("approvals", { id: a.id, digest: a.digest, approve });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="approval-card">
      <div className="approval-heading">
        <ShieldCheck size={18} />
        <strong>
          {a.kind === "bot" ? "Review a new bot" : "Review a memory save"}
        </strong>
        <span>Needs your approval</span>
      </div>
      <p>{a.content}</p>
      {a.kind === "bot" && (
        <details>
          <summary>View proposed instructions</summary>
          <pre>{(a.payload as BotDraft).instructions}</pre>
        </details>
      )}
      <ErrorNote error={error} />
      <div className="modal-actions">
        <button disabled={busy} onClick={() => void resolve(false)}>
          Decline
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void resolve(true)}
        >
          <Check size={15} />
          {a.kind === "bot" ? "Create bot" : "Save memory"}
        </button>
      </div>
    </div>
  );
}
