import { useEffect, useRef, useState } from "react";
import { Boxes, Plug, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import { closeOnBackdrop, type ThemePreference } from "../../components/ui.js";
import type { SettingsTab } from "../../models.js";
import { GeneralPane } from "./GeneralPane.js";
import { ModelsPane } from "./ModelsPane.js";
import { ProvidersPane } from "./ProvidersPane.js";
import { PrivacyPane } from "./PrivacyPane.js";

const tabs: { id: SettingsTab; label: string; icon: typeof Plug }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "models", label: "Models", icon: Boxes },
  { id: "providers", label: "Providers", icon: Plug },
  { id: "privacy", label: "Privacy & data", icon: ShieldCheck },
];

/** Settings float over the workspace; the sidebar and chat stay in place. */
export function SettingsDialog({
  state,
  onRefresh,
  onClose,
  initialTab,
  initialConnection,
  theme,
  onTheme,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  initialTab: SettingsTab;
  initialConnection?: string | undefined;
  theme: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(initialTab),
    [focus, setFocus] = useState(initialConnection);
  // Nested views (forms, pickers) register a back step so Escape unwinds them first.
  const back = useRef<(() => void) | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    setTab(initialTab);
    setFocus(initialConnection);
  }, [initialTab, initialConnection]);
  const go = (next: SettingsTab, connectionId?: string) => {
    back.current = null;
    setFocus(connectionId);
    setTab(next);
  };
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(e) => {
        e.preventDefault();
        if (back.current) back.current();
        else onClose();
      }}
      onClick={(e) => closeOnBackdrop(e, onClose)}
    >
      <nav className="settings-nav" aria-label="Settings sections">
        <h2 id="settings-title">Settings</h2>
        <div role="tablist" aria-orientation="vertical">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="settings-panel"
              className={tab === t.id ? "selected" : ""}
              onClick={() => go(t.id)}
            >
              <t.icon size={16} />
              {t.label}
              {t.id === "providers" && state.connections.length > 0 && (
                <span className="nav-count">{state.connections.length}</span>
              )}
              {t.id === "models" && state.models.length > 0 && (
                <span className="nav-count">{state.models.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
      <section
        className="settings-pane"
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
      >
        <button
          className="icon ghost dialog-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        {tab === "general" && <GeneralPane theme={theme} onTheme={onTheme} />}
        {tab === "models" && (
          <ModelsPane
            key={focus ?? "models"}
            state={state}
            onRefresh={onRefresh}
            focus={focus}
            onNavigate={go}
            backRef={back}
          />
        )}
        {tab === "providers" && (
          <ProvidersPane
            state={state}
            onRefresh={onRefresh}
            onNavigate={go}
            backRef={back}
          />
        )}
        {tab === "privacy" && <PrivacyPane state={state} />}
      </section>
    </dialog>
  );
}
