import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "../../components/ui.js";

const themes = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function GeneralPane({
  theme,
  onTheme,
}: {
  theme: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
}) {
  return (
    <>
      <header className="pane-head">
        <h3>General</h3>
        <p>How Socius looks on this device.</p>
      </header>
      <div className="pane-section">
        <h4>Appearance</h4>
        <div className="theme-options" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={theme === t.value}
              className={`theme-option ${t.value} ${theme === t.value ? "selected" : ""}`}
              onClick={() => onTheme(t.value)}
            >
              <span className="theme-preview" aria-hidden="true">
                <i />
                <b />
              </span>
              <span>
                <t.icon size={14} />
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
