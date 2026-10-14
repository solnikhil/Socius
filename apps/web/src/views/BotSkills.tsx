import { useState } from "react";
import type { BotInstance, SkillManifest } from "@socius/contracts";
import type {
  Release,
  SkillAssignmentStatus,
  SkillAssignmentView,
  Snapshot,
} from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, Modal } from "../components/chrome.js";
import { resolvedModel } from "../models.js";

const STATUS: Record<SkillAssignmentStatus, { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "good" },
  off: { label: "Off", tone: "" },
  "needs-review": { label: "Needs review", tone: "warn" },
  unavailable: { label: "Unavailable", tone: "warn" },
};

/**
 * One bot's skills: which installed procedures it may use and how they load.
 * Assigning a skill adds a procedure, never tools, accounts or permissions.
 */
export function BotSkills({
  bot,
  state,
  onRefresh,
  onClose,
}: {
  bot: BotInstance;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const assigned = state.skillAssignments.filter((a) => a.botId === bot.id);
  const review = state.skillReviews.find((r) => r.botId === bot.id);
  const installed = state.installations
    .filter((i) => i.enabled)
    .map((i) =>
      state.releases.find(
        (r) => r.manifest.id === i.id && r.digest === i.digest,
      ),
    )
    .filter(
      (r): r is Release & { manifest: SkillManifest } =>
        r?.manifest.kind === "skill",
    );
  const available = installed.filter(
    (r) => !assigned.some((a) => a.skillId === r.manifest.id),
  );
  const textOnly = resolvedModel(state, bot.id)?.entry.tools === false;
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
      // A conflict means someone else changed it; show the latest state.
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  const key = (a: SkillAssignmentView) => ({
    botId: bot.id,
    skillId: a.skillId,
    revision: a.revision,
  });
  return (
    <Modal
      title={`Skills for ${bot.name}`}
      className="install-dialog bot-skills"
      onClose={onClose}
    >
      <p className="muted">
        Skills are reusable procedures. {bot.name} sees only the skills you
        assign here. They add no tools or permissions: connected apps still need
        their own access.
      </p>
      {review && (
        <div className="connector-setup" role="status">
          <p>
            {review.reason === "migration"
              ? `Before this update every bot could see every installed skill. ${bot.name} now uses only assigned skills.`
              : `${bot.name}'s template suggests these skills. Nothing was assigned.`}
            {review.suggested.length > 0 &&
              ` Suggested: ${review.suggested.join(", ")}.`}
          </p>
          <div className="modal-actions">
            <button
              disabled={busy}
              onClick={() =>
                void run("skills/reviews/dismiss", { botId: bot.id })
              }
            >
              Done reviewing
            </button>
          </div>
        </div>
      )}
      {textOnly && assigned.some((a) => a.activation === "on-demand") && (
        <p className="muted">
          {bot.name}'s model cannot call tools, so only always-load skills are
          used.
        </p>
      )}
      <div className="skill-list" role="list" aria-label="Assigned skills">
        {assigned.length === 0 && (
          <p className="muted">No skills assigned yet.</p>
        )}
        {assigned.map((a) => (
          <div key={a.skillId} className="skill-row" role="listitem">
            <div className="skill-head">
              <strong>{a.name}</strong>
              <small>{a.release.version}</small>
              <span className={`badge ${STATUS[a.status].tone}`}>
                {STATUS[a.status].label}
              </span>
            </div>
            {a.status !== "ready" && <small>{a.detail}</small>}
            {a.missingDependencies.length > 0 && (
              <small>Also needs: {a.missingDependencies.join(", ")}</small>
            )}
            <div className="skill-controls">
              <label>
                <input
                  type="checkbox"
                  aria-label={`Use ${a.name}`}
                  checked={a.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    void run("skills/assignments/update", {
                      ...key(a),
                      enabled: e.target.checked,
                    })
                  }
                />
                On
              </label>
              <select
                aria-label={`${a.name} loading`}
                value={a.activation}
                disabled={busy}
                onChange={(e) =>
                  void run("skills/assignments/update", {
                    ...key(a),
                    activation: e.target.value,
                  })
                }
              >
                <option value="on-demand">Load when relevant</option>
                <option value="always-load">
                  Always load (~{Math.ceil(a.instructionChars / 4)} tokens)
                </option>
              </select>
              {a.status === "needs-review" && a.installed && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run("skills/assignments/review", {
                      ...key(a),
                      release: a.installed,
                    })
                  }
                >
                  Use {a.installed.version}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => void run("skills/unassign", key(a))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <div className="skill-list" role="list" aria-label="Installed skills">
          <small className="muted">Installed skills</small>
          {available.map((r) => (
            <div key={r.manifest.id} className="skill-row" role="listitem">
              <div className="skill-head">
                <strong>{r.manifest.name}</strong>
                <small>{r.manifest.version}</small>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run("skills/assign", {
                      botId: bot.id,
                      skillId: r.manifest.id,
                    })
                  }
                >
                  Assign
                </button>
              </div>
              <small>{r.manifest.description}</small>
            </div>
          ))}
        </div>
      )}
      <ErrorNote error={error} />
    </Modal>
  );
}
