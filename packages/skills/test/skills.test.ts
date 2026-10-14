import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseSkillFiles,
  readSkillDirectory,
  serializeSkill,
  SkillImportError,
  UNVERSIONED,
} from "../src/index.js";

const enc = (s: string) => new TextEncoder().encode(s);
const skillMd = (front: string, body = "Follow these steps.") =>
  `---\n${front}\n---\n\n${body}\n`;
const valid = skillMd(
  "name: weekly-digest\ndescription: Summarise a week of notes.\nmetadata:\n  version: 1.2.3",
);
const files = (md: string, extra: Record<string, string | Uint8Array> = {}, root = "weekly-digest") => [
  { path: `${root}/SKILL.md`, bytes: enc(md) },
  ...Object.entries(extra).map(([path, v]) => ({
    path: `${root}/${path}`,
    bytes: typeof v === "string" ? enc(v) : v,
  })),
];
const fails = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof SkillImportError && pattern.test(e.message));

test("imports the bundled example skill directory from disk", async () => {
  const entries = await readSkillDirectory(resolve("examples/skills/document-brief"));
  const { manifest, files } = parseSkillFiles(entries);
  assert.equal(manifest.id, "local/document-brief");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.capabilities, ["documents.read", "documents.write"]);
  assert.match(manifest.compatibility!, /tool-capable/);
  assert.equal(manifest.resources![0]!.path, "references/brief-template.md");
  assert.equal(manifest.resources![0]!.kind, "reference");
  assert.equal(files.length, 2);
});

test("maps valid metadata, preserves compatibility and treats allowed-tools as a request", () => {
  const { manifest } = parseSkillFiles(
    files(
      skillMd(
        'name: weekly-digest\ndescription: Summarise.\ncompatibility: Needs network\nallowed-tools: Bash(git:*) Read\nmetadata:\n  version: "2.0.0"\n  author: me',
      ),
      { "scripts/run.sh": "rm -rf /", "references/notes.md": "# Notes", "forms.md": "x" },
    ),
  );
  assert.equal(manifest.version, "2.0.0");
  assert.deepEqual(manifest.allowedTools, ["Bash(git:*)", "Read"]);
  assert.deepEqual(manifest.capabilities, []);
  assert.deepEqual(
    manifest.resources!.map((r) => [r.path, r.kind]),
    [
      ["forms.md", "reference"],
      ["references/notes.md", "reference"],
      ["scripts/run.sh", "script"],
    ],
  );
});

test("unversioned skills use the explicit placeholder version", () => {
  const { manifest } = parseSkillFiles(
    files(skillMd("name: weekly-digest\ndescription: Summarise.")),
  );
  assert.equal(manifest.version, UNVERSIONED);
  assert.equal(manifest.license, "NOASSERTION");
});

test("rejects malformed metadata and invalid names", () => {
  fails(() => parseSkillFiles(files("no frontmatter")), /must start with YAML/);
  fails(() => parseSkillFiles(files("---\nname: a\n")), /not closed/);
  fails(() => parseSkillFiles(files(skillMd("name: [unclosed"))), /Invalid YAML/);
  fails(() => parseSkillFiles(files(skillMd("- a\n- b"))), /mapping/);
  fails(() => parseSkillFiles(files(skillMd("description: x"))), /"name" is required/);
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest"))), /"description" is required/);
  fails(
    () => parseSkillFiles(files(skillMd("name: Weekly_Digest\ndescription: x"), {}, "Weekly_Digest")),
    /Invalid skill name/,
  );
  fails(
    () => parseSkillFiles(files(skillMd("name: weekly--digest\ndescription: x"), {}, "weekly--digest")),
    /Invalid skill name/,
  );
  fails(() => parseSkillFiles(files(skillMd("name: other\ndescription: x"))), /must match its directory/);
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: x\ncolor: red"))), /Unsupported frontmatter field/);
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: x\nmetadata:\n  version: 1.0"))), /quote the value/);
  fails(() => parseSkillFiles(files(skillMd('name: weekly-digest\ndescription: x\nmetadata:\n  version: "1.0"'))), /MAJOR.MINOR.PATCH/);
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: x\nname: again"))), /Invalid YAML/);
  fails(
    () => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: &d x\nlicense: *d"))),
    /aliases|Invalid YAML/,
  );
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: x", "  "))), /instructions/);
  fails(
    () => parseSkillFiles(files(skillMd('name: weekly-digest\ndescription: x\nmetadata:\n  socius-capabilities: "shell.exec"'))),
    /Unknown capability/,
  );
});

test("rejects executable activation and native or misplaced executables", () => {
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: x\nentrypoint: scripts/run.sh"))), /executable activation/);
  fails(() => parseSkillFiles(files(skillMd("name: weekly-digest\ndescription: x\nhooks: {}"))), /executable activation/);
  fails(() => parseSkillFiles(files(valid, { "tool.py": "print(1)" })), /must live in scripts/);
  fails(() => parseSkillFiles(files(valid, { "scripts/tool.exe": "MZ" })), /Native executables/);
  fails(() => parseSkillFiles(files(valid, { "assets/blob": new Uint8Array([0x7f, 0x45, 0x4c, 0x46]) })), /Native executables/);
});

test("rejects path traversal, absolute paths, multiple roots and missing SKILL.md", () => {
  for (const path of ["weekly-digest/../evil.md", "/etc/passwd", "C:/x/SKILL.md", "weekly-digest\\..\\x", "weekly-digest//x"])
    fails(() => parseSkillFiles([...files(valid), { path, bytes: enc("x") }]), /traversal|Unsafe/);
  fails(() => parseSkillFiles([...files(valid), { path: "other/SKILL.md", bytes: enc(valid) }]), /exactly one/);
  fails(() => parseSkillFiles([{ path: "weekly-digest/README.md", bytes: enc("x") }]), /no SKILL.md/);
  fails(() => parseSkillFiles(files(valid, { "References/A.md": "x", "references/a.md": "y" })), /Duplicate/);
  const { ignored } = parseSkillFiles(files(valid, { ".DS_Store": "x" }));
  assert.deepEqual(ignored, ["weekly-digest/.DS_Store"]);
});

test("refuses symbolic links that could escape the directory", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "socius-skill-"));
  try {
    const root = join(dir, "weekly-digest");
    await mkdir(join(root, "references"), { recursive: true });
    await writeFile(join(root, "SKILL.md"), valid);
    await writeFile(join(dir, "secret.txt"), "private");
    try {
      await symlink(join(dir, "secret.txt"), join(root, "references", "leak.md"));
    } catch {
      // Windows without symlink privilege: a directory junction is the equivalent escape.
      try {
        await symlink(dir, join(root, "assets"), "junction");
      } catch {
        t.skip("Links need extra privileges on this system");
        return;
      }
    }
    await assert.rejects(readSkillDirectory(root), /Symbolic links are not supported/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("export produces a standard directory that imports back to the same release", () => {
  const original = parseSkillFiles(
    files(
      skillMd(
        "name: weekly-digest\ndescription: Summarise.\nlicense: MIT\ncompatibility: Any model\nallowed-tools: Read\nmetadata:\n  version: 1.2.3\n  socius-capabilities: documents.read",
      ),
      { "references/a.md": "# A" },
    ),
  );
  const exported = serializeSkill(
    original.manifest,
    original.files.filter((f) => f.path !== "SKILL.md"),
  );
  assert.deepEqual(exported.map((f) => f.path), ["weekly-digest/SKILL.md", "weekly-digest/references/a.md"]);
  const again = parseSkillFiles(exported);
  assert.deepEqual(again.manifest, original.manifest);
});
