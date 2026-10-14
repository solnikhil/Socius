import { useState, type FormEvent } from "react";
import type { BotInstance } from "@socius/contracts";
import type { BotExportDraft, ExportPreview } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, Modal } from "../components/chrome.js";
import { ExportReview } from "./PackageDetail.js";

/** Reusable template from an explicit field allowlist, reviewed before export. */
export function ExportBot({
  bot,
  onClose,
}: {
  bot: BotInstance;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BotExportDraft>({
    name: bot.name,
    description: bot.role,
    role: bot.role,
    instructions: bot.instructions,
    version: "1.0.0",
    license: "MIT",
  });
  const [preview, setPreview] = useState<ExportPreview | null>(null),
    [error, setError] = useState("");
  const field = (key: keyof BotExportDraft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) =>
      setDraft({ ...draft, [key]: e.target.value }),
  });
  async function review(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      setPreview(
        await api<ExportPreview>("export/bot/preview", {
          botId: bot.id,
          draft,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal
      title="Export as template"
      className="install-dialog"
      onClose={onClose}
    >
      <form className="form" onSubmit={review}>
        <p className="muted">
          Edit what others will receive. Chats, memory, credentials, permissions
          and routines are never exported.
        </p>
        <label>
          Name
          <input required maxLength={100} {...field("name")} />
        </label>
        <label>
          Description
          <input required maxLength={1024} {...field("description")} />
        </label>
        <label>
          Role
          <input required maxLength={200} {...field("role")} />
        </label>
        <label>
          Instructions
          <textarea required rows={6} {...field("instructions")} />
        </label>
        <label>
          Version
          <input required pattern="\d+\.\d+\.\d+" {...field("version")} />
        </label>
        <label>
          License
          <input required {...field("license")} />
        </label>
        <ErrorNote error={error} />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Review export
          </button>
        </div>
      </form>
      {preview && (
        <ExportReview
          preview={preview}
          onClose={() => setPreview(null)}
          onConfirm={(acknowledge) =>
            api("export/bot", {
              botId: bot.id,
              draft,
              digest: preview.digest,
              acknowledge,
            })
          }
        />
      )}
    </Modal>
  );
}
