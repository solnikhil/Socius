// Page observations sent to a model. Playwright's AI-mode aria snapshot gives
// stable element references; form-field values are removed before anything
// leaves the browser, so typed passwords, codes and drafts never reach a model.

const FIELD =
  /^(\s*- )(textbox|searchbox|combobox|spinbutton|slider)\b(.*?)(: .*)?$/;

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
    const match = FIELD.exec(line);
    if (match && match[4]) {
      out.push(`${match[1]}${match[2]}${match[3]}: [value hidden]`);
      // Block scalars (`: |`, `: >`) continue on deeper-indented lines.
      if (/^: [|>][-+]?\s*$/.test(match[4])) skipIndent = indent;
      continue;
    }
    out.push(line);
  }
  const text = out.join("\n");
  return text.length > max
    ? `${text.slice(0, max)}\n… (page truncated; scroll or extract for more)`
    : text;
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
