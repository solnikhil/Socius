import { Check, Settings } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Snapshot } from "@socius/contracts/app";
import type { ModelEntry } from "@socius/contracts/providers";
import { api } from "../api.js";
import { ProviderMark } from "./ProviderMark.js";
import {
  connectionOf,
  modelKey,
  resolvedModel,
  sameModel,
  type OpenSettings,
} from "../models.js";

/** Assign this bot's model from its name menu. */
export function BotModelMenu({
  bot,
  state,
  onRefresh,
  onSettings,
  onError,
  onClose,
}: {
  bot: BotInstance;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onSettings: OpenSettings;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const current = resolvedModel(state, bot.id);
  const override = state.selection.bots[bot.id];
  const defaultEntry = state.models.find((m) =>
    sameModel(state.selection.default, m),
  );
  async function choose(entry: ModelEntry | null) {
    try {
      await api("models/select", {
        botId: bot.id,
        model: entry && {
          connectionId: entry.connectionId,
          modelId: entry.modelId,
        },
      });
      await onRefresh();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  function openSettings() {
    onClose();
    onSettings(state.connections.length ? "models" : "providers");
  }
  return (
    <div className="bot-model-menu">
      <div className="menu-label">Model</div>
      {state.models.length === 0 ? (
        <button type="button" onClick={openSettings}>
          <Settings size={15} />
          <span>Choose a model</span>
        </button>
      ) : (
        <div
          className="bot-model-options"
          role="radiogroup"
          aria-label={`Model for ${bot.name}`}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!override}
            aria-label="Workspace default"
            onClick={() => void choose(null)}
          >
            <span className="menu-check">
              {!override && <Check size={14} />}
            </span>
            <span className="model-option">
              <strong>Workspace default</strong>
              <small>
                {defaultEntry?.label ?? current?.entry.label ?? "Not set"}
              </small>
            </span>
          </button>
          {state.models.map((m) => {
            const owner = connectionOf(state, m.connectionId);
            const selected = sameModel(override, m);
            return (
              <button
                key={modelKey(m)}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={m.label}
                onClick={() => void choose(m)}
              >
                <span className="menu-check">
                  {selected && <Check size={14} />}
                </span>
                {owner && (
                  <ProviderMark id={owner.connection.provider} size={20} />
                )}
                <span className="model-option">
                  <strong>{m.label}</strong>
                  <small>
                    {owner?.connection.label}
                    {m.tools === false ? " · no tools" : ""}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {state.models.length > 0 && (
        <button type="button" onClick={openSettings}>
          <Settings size={15} />
          <span>Manage models</span>
        </button>
      )}
    </div>
  );
}
