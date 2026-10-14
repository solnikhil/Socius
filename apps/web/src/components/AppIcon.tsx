import { BookOpen, FileText } from "lucide-react";
import type { Manifest } from "@socius/contracts";
import { Avatar } from "./chrome.js";
import github from "../assets/connectors/github.svg?url";
import gmail from "../assets/connectors/gmail.svg?url";
import googleCalendar from "../assets/connectors/google-calendar.svg?url";
import googleDrive from "../assets/connectors/google-drive.svg?url";
import linear from "../assets/connectors/linear.svg?url";
import notion from "../assets/connectors/notion.svg?url";
import slack from "../assets/connectors/slack.svg?url";

// Connector logos (CC0, see assets/connectors/LICENSE.md) identify the service
// only. Connectors without one fall back to their initial.
const logos: Record<string, string> = {
  "socius/notion": notion,
  "socius/linear": linear,
  "socius/github": github,
  "socius/gmail": gmail,
  "socius/google-calendar": googleCalendar,
  "socius/slack": slack,
  "socius/google-drive": googleDrive,
};

/** A square app tile for catalog entries; bots use their character avatar. */
export function AppIcon({
  item,
  size = 44,
}: {
  item: Pick<Manifest, "id" | "name" | "kind">;
  size?: number;
}) {
  if (item.kind === "bot")
    return (
      <span className="app-icon bot" style={{ width: size, height: size }}>
        <Avatar name={item.name} size={size * 0.78} />
      </span>
    );
  const glyph = size * 0.5;
  return (
    <span
      className={`app-icon ${item.kind}`}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
    >
      {item.kind === "connector" && logos[item.id] ? (
        <img
          src={logos[item.id]}
          alt=""
          width={size * 0.58}
          height={size * 0.58}
          draggable={false}
        />
      ) : item.kind === "connector" ? (
        <span className="monogram" style={{ fontSize: size * 0.48 }}>
          {item.name[0]}
        </span>
      ) : /summar|document/i.test(item.id) ? (
        <FileText size={glyph} />
      ) : (
        <BookOpen size={glyph} />
      )}
    </span>
  );
}
