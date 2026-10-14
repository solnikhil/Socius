import { test } from "node:test";
import assert from "node:assert/strict";
import { Manifest } from "@socius/contracts";
import { Catalog, instantiateBot, mainBot } from "../src/index.js";

const skill = (
  id: string,
  dependencies: { id: string; version: string }[] = [],
) => ({
  schemaVersion: 1,
  id,
  version: "1.0.0",
  name: id,
  description: "A reusable workflow",
  publisher: "test",
  license: "MIT",
  kind: "skill",
  capabilities: ["files.read"],
  dependencies,
  instructions: "Read the selected file and cite evidence.",
});
test("separates bot templates from skills and connectors", () => {
  const { instructions: _instructions, ...connectorBase } =
    skill("test/notion");
  const connector = {
    ...connectorBase,
    kind: "connector",
    protocol: "mcp",
    transport: "streamable-http",
    authentication: "oauth",
    setup: "Connect your account.",
  };
  const catalog = new Catalog([mainBot, skill("test/summary"), connector]);
  assert.equal(catalog.list("bots").length, 1);
  assert.equal(catalog.list("skills-and-connectors").length, 2);
});
test("rejects unknown state and credentials in published templates", () => {
  for (const field of [
    "apiKey",
    "memories",
    "transcripts",
    "cookies",
    "grantedCapabilities",
  ]) {
    assert.equal(
      Manifest.safeParse({ ...mainBot, [field]: "private" }).success,
      false,
    );
  }
});
test("rejects malformed identities, versions and unsupported capabilities", () => {
  for (const override of [
    { id: "../escape" },
    { version: "*" },
    { capabilities: ["shell.exec"] },
  ]) {
    assert.equal(
      Manifest.safeParse({ ...mainBot, ...override }).success,
      false,
    );
  }
});
test("resolves dependencies before dependents and requests all capabilities without granting them", () => {
  const catalog = new Catalog([
    skill("test/root", [{ id: "test/leaf", version: "1.0.0" }]),
    skill("test/leaf"),
  ]);
  const plan = catalog.planInstall("test/root", "1.0.0");
  assert.deepEqual(
    plan.packages.map((p) => p.id),
    ["test/leaf", "test/root"],
  );
  assert.deepEqual(plan.requestedCapabilities, ["files.read"]);
  assert.equal(plan.grantsPermissions, false);
});
test("fails on absent and mismatched dependencies", () => {
  const catalog = new Catalog([
    skill("test/root", [{ id: "test/leaf", version: "2.0.0" }]),
    skill("test/leaf"),
  ]);
  assert.throws(
    () => catalog.planInstall("test/root", "1.0.0"),
    /Missing package/,
  );
});
test("detects dependency cycles", () => {
  const catalog = new Catalog([
    skill("test/a", [{ id: "test/b", version: "1.0.0" }]),
    skill("test/b", [{ id: "test/a", version: "1.0.0" }]),
  ]);
  assert.throws(
    () => catalog.planInstall("test/a", "1.0.0"),
    /Dependency cycle/,
  );
});
test("deduplicates shared dependencies", () => {
  const catalog = new Catalog([
    skill("test/root", [
      { id: "test/a", version: "1.0.0" },
      { id: "test/leaf", version: "1.0.0" },
    ]),
    skill("test/a", [{ id: "test/leaf", version: "1.0.0" }]),
    skill("test/leaf"),
  ]);
  assert.equal(catalog.planInstall("test/root", "1.0.0").packages.length, 3);
});
test("rejects incompatible versions within one installation plan", () => {
  const catalog = new Catalog([
    skill("test/root", [
      { id: "test/a", version: "1.0.0" },
      { id: "test/leaf", version: "2.0.0" },
    ]),
    skill("test/a", [{ id: "test/leaf", version: "1.0.0" }]),
    skill("test/leaf"),
    { ...skill("test/leaf"), version: "2.0.0" },
  ]);
  assert.throws(
    () => catalog.planInstall("test/root", "1.0.0"),
    /Version conflict/,
  );
});
test("rejects duplicate catalog entries and duplicate declared dependencies", () => {
  // Re-adding identical content is idempotent; one identity can never hold two contents.
  assert.equal(new Catalog([mainBot, mainBot]).list().length, 1);
  assert.throws(
    () => new Catalog([mainBot, { ...mainBot, description: "Changed" }]),
    /Duplicate package/,
  );
  const dependency = { id: "test/leaf", version: "1.0.0" };
  assert.equal(
    Manifest.safeParse(skill("test/root", [dependency, dependency])).success,
    false,
  );
});
test("catalog returns cannot mutate the stored package definition", () => {
  const input = { ...mainBot, capabilities: [...mainBot.capabilities] };
  const catalog = new Catalog([input]);
  input.name = "Changed";
  catalog.list()[0]!.name = "Changed again";
  catalog.planInstall(mainBot.id, mainBot.version).packages[0]!.name =
    "Changed plan";
  assert.equal(catalog.list()[0]!.name, "Socius");
});
test("each installation creates a distinct bot with no grants and disabled routines", () => {
  const a = instantiateBot(mainBot),
    b = instantiateBot(mainBot);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.memoryNamespace, b.memoryNamespace);
  assert.deepEqual(a.grantedCapabilities, []);
  assert.equal(a.routinesEnabled, false);
  assert.deepEqual(a.template, { id: "socius/main", version: mainBot.version });
});
test("rejects non-bot instantiation and empty names", () => {
  assert.throws(() => instantiateBot(skill("test/summary")), /Expected bot/);
  assert.throws(() => instantiateBot(mainBot, "  "), /Invalid bot name/);
});
