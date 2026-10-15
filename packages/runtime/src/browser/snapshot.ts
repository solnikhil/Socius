// Page observations sent to a model. Playwright's AI-mode aria snapshot gives
// stable element references; form-field values are removed before anything
// leaves the browser, so typed passwords, codes and drafts never reach a model.

const ROLES = "textbox|searchbox|combobox|spinbutton|slider";
/**
 * An editable field line. Its name and attributes end at the `[ref=…]` token
 * and any bracketed attributes after it; everything after that is the value.
 * A page-supplied name containing "[ref=" can only cut the line short, which
 * hides more, never less.
 */
const FIELD = new RegExp(
  `^(\\s*- )(${ROLES})\\b(.*?\\[ref=[^\\]]+\\](?:\\s*\\[[^\\]]*\\])*)(:.*)?$`,
);
/** Fallback for a field line without a ref: the first ":" starts the value. */
const FIELD_NO_REF = new RegExp(`^(\\s*- )(${ROLES})\\b([^:]*)(:.*)?$`);

/**
 * Removes the value of every editable field, including multi-line block
 * values, and clips the result to `max` characters.
 */
export function redactSnapshot(snapshot: string, max: number): string {
  const out: string[] = [];
  let skipIndent = -1;
  for (const line of snapshot.split("\n")) {
    const indent = line.length - line.trimStart().length;
    if (skipIndent >= 0) {
      if (indent > skipIndent && line.trim()) continue;
      skipIndent = -1;
    }
    const match = FIELD.exec(line) ?? FIELD_NO_REF.exec(line);
    // ": value", a block scalar (": |") or ":" followed by child lines such
    // as a rich-text editor's paragraphs: all of it is hidden.
    if (match?.[4]) {
      out.push(`${match[1]}${match[2]}${match[3]}: [value hidden]`);
      skipIndent = indent;
      continue;
    }
    out.push(line);
  }
  const text = out.join("\n");
  return text.length > max
    ? `${text.slice(0, max)}\n… (page truncated; scroll or extract for more)`
    : text;
}

/**
 * Splits an observation into parts of at most `max` characters on line
 * boundaries, so a long page can be read part by part instead of only its top.
 * A single over-long line is cut rather than dropped.
 */
export function splitObservation(text: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const raw of text.split("\n")) {
    const line = raw.length > max ? raw.slice(0, max) : raw;
    if (current && current.length + 1 + line.length > max) {
      parts.push(current);
      current = line;
    } else current = current ? `${current}\n${line}` : line;
  }
  if (current || !parts.length) parts.push(current);
  return parts;
}

/** Refs as Playwright writes them, e.g. `e12` or `f1e3` inside frames. */
export const ELEMENT_REF = /^(?:f\d+)?e\d+$/;

/** Collapses whitespace and clips page text for extraction results. */
export function clipText(text: string, max: number) {
  const clean = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
