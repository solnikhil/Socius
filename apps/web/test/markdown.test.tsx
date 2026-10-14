import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/chrome.js";

test("chat Markdown preserves identifiers and Unicode words containing underscores", () => {
  const text =
    "SOCIUS_LIVE_OK openrouter_free API_V2_KEY नमस्ते_दुनिया नाम_मान_";
  const html = renderToStaticMarkup(<Markdown text={text} />);
  assert.ok(html.includes(text));
  assert.ok(!html.includes("<em>"));
});

test("chat Markdown still supports emphasis and renders HTML as inert text", () => {
  const html = renderToStaticMarkup(
    <Markdown
      text={"_hello world_ **reviewed** `api_key` <script>alert(1)</script>"}
    />,
  );
  assert.ok(html.includes("<em>hello world</em>"));
  assert.ok(html.includes("<strong>reviewed</strong>"));
  assert.ok(html.includes("<code>api_key</code>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});

test("streaming closes unfinished bold and code so no raw markers show", async () => {
  const { closeOpenMarks } = await import("../src/components/streaming.js");
  const cases: [string, string][] = [
    ["- **Read a specific", "- **Read a specific**"],
    ["Use `linear_sea", "Use `linear_sea`"],
    ["**bold `co", "**bold `co`**"],
    ["`a ** b", "`a ** b`"],
    ["- **", "- "],
    ["Run `", "Run "],
    ["**done** and `done`", "**done** and `done`"],
    ["```ts\nconst a = `x", "```ts\nconst a = `x"],
  ];
  for (const [input, expected] of cases)
    assert.equal(closeOpenMarks(input), expected, input);
  const html = renderToStaticMarkup(
    <Markdown text={closeOpenMarks("- **Read a specific")} />,
  );
  assert.ok(html.includes("<strong>Read a specific</strong>"));
  assert.ok(!html.includes("**"));
});
