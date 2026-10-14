import { useState } from "react";
import { Check, ChevronDown, Settings } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Snapshot } from "@socius/contracts/app";
import type { ModelEntry } from "@socius/contracts/providers";
import { api } from "../api.js";
import { ProviderMark } from "./ProviderMark.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  connectionOf,
  modelKey,
  resolvedModel,
  sameModel,
  type OpenSettings,
} from "../models.js";

/** Composer chip: choose the model for this bot, or follow the default. */
export function ModelPicker({
  bot,
  state,
  onRefresh,
  onSettings,
  onError,
}: {
  bot: BotInstance;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onSettings: OpenSettings;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = resolvedModel(state, bot.id);
  const override = state.selection.bots[bot.id];
  const defaultEntry = state.models.find((m) =>
    sameModel(state.selection.default, m),
  );
  async function choose(entry: ModelEntry | null) {
    setOpen(false);
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
  if (!state.models.length)
    return (
      <button
        type="button"
        className="model-chip"
        onClick={() =>
          onSettings(state.connections.length ? "models" : "providers")
        }
      >
        Choose model
        <ChevronDown size={12} />
      </button>
    );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="model-chip"
          aria-label={`Model: ${current?.entry.label ?? "none"}`}
        >
          {current?.entry.label ?? "Choose model"}
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        className="menu-panel model-menu"
      >
        <DropdownMenuLabel className="menu-label">
          Model for {bot.name}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={override ? modelKey(override) : "default"}
          onValueChange={(value) => {
            if (value === "default") {
              void choose(null);
              return;
            }
            const match = state.models.find((m) => modelKey(m) === value);
            if (match) void choose(match);
          }}
        >
          <DropdownMenuRadioItem value="default">
            <span className="menu-check">
              {!override && <Check size={14} />}
            </span>
            <span className="model-option">
              <strong>Workspace default</strong>
              <small>{defaultEntry?.label ?? "Not set"}</small>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator className="menu-divider" />
          <div className="model-menu-list">
            {state.models.map((m) => {
              const owner = connectionOf(state, m.connectionId);
              return (
                <DropdownMenuRadioItem key={modelKey(m)} value={modelKey(m)}>
                  <span className="menu-check">
                    {sameModel(override, m) && <Check size={14} />}
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
                </DropdownMenuRadioItem>
              );
            })}
          </div>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="menu-divider" />
        <DropdownMenuItem
          onSelect={() => {
            onSettings("models");
          }}
        >
          <span className="menu-check">
            <Settings size={14} />
          </span>
          Manage models…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
