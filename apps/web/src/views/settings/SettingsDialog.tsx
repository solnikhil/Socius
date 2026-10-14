import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Moon,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import {
  useDialogMotion,
  type ThemePreference,
} from "../../components/chrome.js";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SettingsTab } from "../../models.js";
import { RemotePane } from "./RemotePane.js";
import { GeneralPane } from "./GeneralPane.js";
import { ModelsPane } from "./ModelsPane.js";
import { ProvidersPane } from "./ProvidersPane.js";
import { PrivacyPane } from "./PrivacyPane.js";
import { DreamingPane } from "./DreamingPane.js";

const tabs: { id: SettingsTab; label: string; icon: typeof Plug }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "models", label: "Models", icon: Boxes },
  { id: "providers", label: "Providers", icon: Plug },
  { id: "remote", label: "Remote access & devices", icon: ShieldCheck },
  { id: "dreaming", label: "Dreaming", icon: Moon },
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
  onOpenActivity,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  initialTab: SettingsTab;
  initialConnection?: string | undefined;
  theme: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
  onOpenActivity: () => void;
}) {
  const [tab, setTab] = useState(initialTab),
    [focus, setFocus] = useState(initialConnection);
  // Nested views (forms, pickers) register a back step so Escape unwinds them first.
  const back = useRef<(() => void) | null>(null);
  const motion = useDialogMotion(onClose);
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
    <Dialog modal={false} open={motion.open} onOpenChange={motion.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dialog-surface settings-dialog"
        aria-labelledby="settings-title"
        onAnimationEnd={motion.onAnimationEnd}
        onInteractOutside={motion.onInteractOutside}
        onEscapeKeyDown={(e) => {
          if (back.current) {
            e.preventDefault();
            back.current();
          }
        }}
      >
        <nav className="settings-nav" aria-label="Settings sections">
          <DialogTitle id="settings-title">Settings</DialogTitle>
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
            onClick={motion.requestClose}
          >
            <X size={18} />
          </button>
          {tab === "general" && (
            <GeneralPane
              theme={theme}
              onTheme={onTheme}
              onOpenActivity={onOpenActivity}
            />
          )}
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
          {tab === "providers" && location.protocol === "https:" && (
            <p>
              Do this on your laptop. Provider credentials stay on the host.
            </p>
          )}
          {tab === "providers" && location.protocol !== "https:" && (
            <ProvidersPane
              state={state}
              onRefresh={onRefresh}
              onNavigate={go}
              backRef={back}
            />
          )}
          {tab === "dreaming" && (
            <DreamingPane state={state} onRefresh={onRefresh} />
          )}
          {tab === "remote" && <RemotePane />}
          {tab === "privacy" && <PrivacyPane state={state} />}
        </section>
      </DialogContent>
    </Dialog>
  );
}
