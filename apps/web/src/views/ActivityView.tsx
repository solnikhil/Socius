import { Check } from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import { ApprovalCard } from "../components/ApprovalCard.js";
import { ActionCard, needsAttention } from "../components/ActionCard.js";

export function ActivityView({
  state,
  onRefresh,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const pending = state.approvals.filter(
    (a) => a.state === "pending" && Date.parse(a.expiresAt) > Date.now(),
  );
  const actions = state.actions.filter(needsAttention);
  return (
    <section className="page">
      <span className="eyebrow">ALWAYS IN THE LOOP</span>
      <h1>Here’s what’s happening.</h1>
      <p className="subtitle">
        Review decisions and inspect your workspace’s activity.
      </p>
      {(pending.length > 0 || actions.length > 0) && (
        <div className="approval-list">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} onRefresh={onRefresh} />
          ))}
          {actions.map((a) => (
            <ActionCard
              key={a.id}
              action={a}
              state={state}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
      <div className="activity-list">
        {state.activity.map((a) => (
          <article key={a.id}>
            <span className="activity-dot">
              <Check size={14} />
            </span>
            <div>
              <strong>{a.description}</strong>
              <small>{a.kind}</small>
            </div>
            <time>{new Date(a.createdAt).toLocaleString()}</time>
          </article>
        ))}
      </div>
    </section>
  );
}
