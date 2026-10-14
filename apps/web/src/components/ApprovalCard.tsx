import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import type { BotAppearance } from "@socius/contracts";
import type { Approval, BotDraft } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote } from "./chrome.js";
import { AvatarPicker, appearanceOf } from "./avatar.js";

export function ApprovalCard({
  approval: a,
  onRefresh,
}: {
  approval: Approval;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [look, setLook] = useState<BotAppearance>();
  const draft = a.kind === "bot" ? (a.payload as BotDraft) : undefined;
  async function resolve(approve: boolean) {
    setBusy(true);
    try {
      await api("approvals", {
        id: a.id,
        digest: a.digest,
        approve,
        ...(approve && draft
          ? { appearance: appearanceOf(draft.name, look) }
          : {}),
      });
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
      {draft && (
        <>
          <AvatarPicker
            name={draft.name}
            value={appearanceOf(draft.name, look)}
            onChange={setLook}
            compact
          />
          <details>
            <summary>View proposed instructions</summary>
            <pre>{draft.instructions}</pre>
          </details>
        </>
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
