import { BookOpen, FileText } from "lucide-react";
import type { Manifest } from "@socius/contracts";
import { Avatar } from "./ui.js";

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
      {item.kind === "connector" ? (
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
