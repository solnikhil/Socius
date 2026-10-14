// Agent Skills (https://agentskills.io/specification) directory import and export.
// Parsing never executes package content: scripts are stored inert, and frontmatter
// that asks for executable activation is rejected.
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { parseDocument, stringify } from "yaml";
import {
  Capability,
  Dependency,
  SkillManifest,
  SkillName,
  Version,
  type SkillResource,
} from "@socius/contracts";

export const SKILL_LIMITS = {
  maxFiles: 200,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 5 * 1024 * 1024,
  maxSkillMdBytes: 256 * 1024,
  maxDepth: 8,
};
export const UNVERSIONED = "0.0.0";
export class SkillImportError extends Error {}
const reject = (message: string): never => {
  throw new SkillImportError(message);
};

export interface SkillFileEntry {
  /** Forward-slash path that starts with the skill's root directory name. */
  path: string;
  bytes: Uint8Array;
}
export interface SkillFile {
  /** Path relative to the skill root, for example `references/guide.md`. */
  path: string;
  bytes: Uint8Array;
  kind: SkillResource["kind"];
}
export interface ParsedSkill {
  manifest: SkillManifest;
  files: SkillFile[];
  ignored: string[];
}

const FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const ACTIVATION_FIELDS =
  /^(entry-?point|command|commands|run|exec|hooks?|scripts?|main|bin|mcp|mcp-?servers|install|postinstall)$/i;
const NATIVE_BINARY = /\.(exe|dll|so|dylib|node|msi|com|scr|app|bin|jar)$/i;
const SCRIPT_FILE = /\.(sh|bash|zsh|ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|rb|pl|php)$/i;
const TEXT_FILE = /\.(md|markdown|txt|json|ya?ml|csv|tsv|xml|html?)$/i;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const IGNORED_SEGMENT = /^\./;
const utf8 = new TextDecoder("utf-8", { fatal: true });
export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function isNativeExecutable(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 4)).toString("hex");
  return (
    head === "7f454c46" || // ELF
    head.startsWith("4d5a") || // PE/MZ
    ["feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe"].includes(head)
  );
}

/** Validates one archive-style path; returns its segments. */
export function entrySegments(path: string): string[] {
  if (
    !path ||
    path.length > 400 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path)
  )
    reject(`Unsafe path: ${JSON.stringify(path.slice(0, 120))}`);
  const segments = path.split("/");
  for (const s of segments)
    if (s === "" || s === "." || s === "..")
      reject(`Path traversal is not allowed: ${path}`);
  if (segments.length > SKILL_LIMITS.maxDepth + 1)
    reject(`Path is nested too deeply: ${path}`);
  return segments;
}

function resourceKind(path: string): SkillResource["kind"] {
  if (path.startsWith("scripts/")) return "script";
  if (path.startsWith("assets/")) return "asset";
  return TEXT_FILE.test(path) ? "reference" : "asset";
}

export function splitFrontmatter(text: string): { yaml: string; body: string } {
  const source = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!source.startsWith("---\n"))
    reject("SKILL.md must start with YAML frontmatter delimited by ---");
  const end = source.indexOf("\n---", 3);
  if (end < 0 || !/^\n---[ \t]*(\n|$)/.test(source.slice(end, end + 6)))
    reject("SKILL.md frontmatter is not closed with ---");
  const after = source.indexOf("\n", end + 4);
  return {
    yaml: source.slice(4, end + 1),
    body: after < 0 ? "" : source.slice(after + 1),
  };
}

function parseYaml(yaml: string): Record<string, unknown> {
  const doc = parseDocument(yaml, {
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
  });
  if (doc.errors.length)
    reject(`Invalid YAML frontmatter: ${doc.errors[0]!.message.split("\n")[0]}`);
  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: 0 });
  } catch {
    reject("YAML aliases and anchors are not supported in skill metadata");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    reject("Frontmatter must be a YAML mapping");
  return data as Record<string, unknown>;
}

const words = (value: string | undefined) =>
  value?.split(/\s+/).filter(Boolean) ?? [];

/** Validates frontmatter and maps it into a Socius skill manifest. */
export function skillManifestFromMarkdown(
  text: string,
  directoryName: string,
  resources: SkillResource[],
  publisher = "local",
): SkillManifest {
  const { yaml, body } = splitFrontmatter(text);
  const data = parseYaml(yaml);
  for (const key of Object.keys(data)) {
    if (ACTIVATION_FIELDS.test(key))
      reject(
        `Frontmatter field "${key}" requests executable activation, which Socius does not support`,
      );
    if (!FRONTMATTER_FIELDS.has(key))
      reject(`Unsupported frontmatter field "${key}"`);
  }
  const text_ = (key: string, max: number, required = false) => {
    const value = data[key];
    if (value === undefined || value === null) {
      if (required) reject(`Frontmatter field "${key}" is required`);
      return undefined;
    }
    if (typeof value !== "string" || !value.trim())
      reject(`Frontmatter field "${key}" must be a non-empty string`);
    if ((value as string).length > max)
      reject(`Frontmatter field "${key}" exceeds ${max} characters`);
    return (value as string).trim();
  };
  const name = text_("name", 64, true)!;
  if (!SkillName.safeParse(name).success)
    reject(
      `Invalid skill name "${name}": use lowercase letters, digits and single hyphens`,
    );
  if (name !== directoryName)
    reject(
      `Skill name "${name}" must match its directory name "${directoryName}"`,
    );
  const description = text_("description", 1024, true)!;
  const license = text_("license", 200);
  const compatibility = text_("compatibility", 500);
  const allowedTools = words(text_("allowed-tools", 4000));
  let metadata: Record<string, string> | undefined;
  if (data.metadata !== undefined) {
    const m = data.metadata;
    if (!m || typeof m !== "object" || Array.isArray(m))
      reject('Frontmatter field "metadata" must be a mapping');
    metadata = {};
    for (const [k, v] of Object.entries(m as object)) {
      if (typeof v !== "string")
        reject(`metadata.${k} must be a string; quote the value`);
      if (k.length > 64 || (v as string).length > 1000)
        reject(`metadata.${k} is too long`);
      metadata[k] = v as string;
    }
  }
  const version = metadata?.version ?? UNVERSIONED;
  if (!Version.safeParse(version).success)
    reject("metadata.version must be an exact MAJOR.MINOR.PATCH version");
  // Optional Socius extensions live in metadata so the file stays standard.
  const capabilities = words(metadata?.["socius-capabilities"]).map((c) => {
    const parsed = Capability.safeParse(c);
    return parsed.success
      ? parsed.data
      : reject(`Unknown capability "${c}" in metadata.socius-capabilities`);
  });
  const dependencies = words(metadata?.["socius-dependencies"]).map((d) => {
    const at = d.lastIndexOf("@");
    const parsed = Dependency.safeParse({
      id: d.slice(0, at),
      version: d.slice(at + 1),
    });
    return parsed.success
      ? parsed.data
      : reject(`Invalid dependency "${d}"; use publisher/name@1.2.3`);
  });
  const instructions = body.trim();
  if (!instructions) reject("SKILL.md must contain instructions after the frontmatter");
  const parsed = SkillManifest.safeParse({
    schemaVersion: 1,
    id: `${publisher}/${name}`,
    version,
    kind: "skill",
    name,
    description,
    publisher,
    license: license ?? "NOASSERTION",
    capabilities,
    dependencies,
    instructions,
    ...(compatibility ? { compatibility } : {}),
    ...(allowedTools.length ? { allowedTools } : {}),
    ...(metadata ? { metadata } : {}),
    ...(resources.length ? { resources } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    reject(`Invalid skill metadata at ${issue.path.join(".") || "root"}: ${issue.message}`);
  }
  return parsed.data!;
}

/** Validates an in-memory skill directory, for example a browser folder upload. */
export function parseSkillFiles(
  entries: SkillFileEntry[],
  publisher = "local",
): ParsedSkill {
  if (!entries.length) reject("The skill directory is empty");
  const roots = new Set<string>();
  const files: SkillFile[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    const segments = entrySegments(entry.path);
    if (segments.length < 2) reject(`File must be inside the skill directory: ${entry.path}`);
    roots.add(segments[0]!);
    if (roots.size > 1) reject("Import exactly one skill directory");
    if (segments.some((s) => IGNORED_SEGMENT.test(s))) {
      ignored.push(entry.path);
      continue;
    }
    for (const s of segments)
      if (!SEGMENT.test(s)) reject(`Unsupported characters in path: ${entry.path}`);
    const path = segments.slice(1).join("/");
    const folded = path.toLowerCase();
    if (seen.has(folded)) reject(`Duplicate file path: ${path}`);
    seen.add(folded);
    if (entry.bytes.byteLength > SKILL_LIMITS.maxFileBytes)
      reject(`File is larger than 1 MiB: ${path}`);
    total += entry.bytes.byteLength;
    if (total > SKILL_LIMITS.maxTotalBytes) reject("Skill directory is larger than 5 MiB");
    if (NATIVE_BINARY.test(path) || isNativeExecutable(entry.bytes))
      reject(`Native executables are not supported: ${path}`);
    const kind = path === "SKILL.md" ? "reference" : resourceKind(path);
    if (SCRIPT_FILE.test(path) && kind !== "script")
      reject(`Executable scripts must live in scripts/ and remain inert: ${path}`);
    files.push({ path, bytes: entry.bytes, kind });
  }
  if (files.length > SKILL_LIMITS.maxFiles) reject("Skill has too many files");
  const skillMd = files.find((f) => f.path === "SKILL.md");
  if (!skillMd) reject("The directory has no SKILL.md at its root");
  if (skillMd!.bytes.byteLength > SKILL_LIMITS.maxSkillMdBytes)
    reject("SKILL.md is larger than 256 KiB");
  let text: string;
  try {
    text = utf8.decode(skillMd!.bytes);
  } catch {
    return reject("SKILL.md is not valid UTF-8");
  }
  const resources = files
    .filter((f) => f.path !== "SKILL.md")
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const manifest = skillManifestFromMarkdown(
    text,
    [...roots][0]!,
    resources.map((f) => ({
      path: f.path,
      sha256: sha256(f.bytes),
      size: f.bytes.byteLength,
      kind: f.kind,
    })),
    publisher,
  );
  return { manifest, files: [skillMd!, ...resources], ignored };
}

/** Reads a local skill directory without following symbolic links or junctions. */
export async function readSkillDirectory(dir: string): Promise<SkillFileEntry[]> {
  if ((await lstat(dir)).isSymbolicLink())
    reject("The skill directory itself is a symbolic link");
  const root = await realpath(dir);
  const name = basename(root);
  const entries: SkillFileEntry[] = [];
  let total = 0;
  async function walk(relative: string[], depth: number) {
    if (depth > SKILL_LIMITS.maxDepth) reject("Skill directory is nested too deeply");
    const absolute = join(root, ...relative);
    for (const item of await readdir(absolute)) {
      const path = [...relative, item];
      const full = join(root, ...path);
      const info = await lstat(full);
      if (info.isSymbolicLink())
        reject(`Symbolic links are not supported: ${path.join("/")}`);
      if (info.isDirectory()) {
        await walk(path, depth + 1);
        continue;
      }
      if (!info.isFile()) reject(`Unsupported special file: ${path.join("/")}`);
      if (info.size > SKILL_LIMITS.maxFileBytes)
        reject(`File is larger than 1 MiB: ${path.join("/")}`);
      total += info.size;
      if (total > SKILL_LIMITS.maxTotalBytes) reject("Skill directory is larger than 5 MiB");
      const resolved = await realpath(full);
      if (!resolved.startsWith(root + sep))
        reject(`File escapes the skill directory: ${path.join("/")}`);
      entries.push({
        path: [name, ...path].join("/"),
        bytes: new Uint8Array(await readFile(full)),
      });
      if (entries.length > SKILL_LIMITS.maxFiles) reject("Skill has too many files");
    }
  }
  await walk([], 0);
  return entries;
}

/** Serializes a skill release as a standard Agent Skills directory. */
export function serializeSkill(
  manifest: SkillManifest,
  resources: { path: string; bytes: Uint8Array }[],
): SkillFileEntry[] {
  const name = manifest.id.split("/")[1]!;
  if (!SkillName.safeParse(name).success)
    reject(`"${name}" is not a valid Agent Skills name`);
  const metadata: Record<string, string> = { ...manifest.metadata };
  if (manifest.version !== UNVERSIONED) metadata.version = manifest.version;
  if (manifest.capabilities.length)
    metadata["socius-capabilities"] = manifest.capabilities.join(" ");
  if (manifest.dependencies.length)
    metadata["socius-dependencies"] = manifest.dependencies
      .map((d) => `${d.id}@${d.version}`)
      .join(" ");
  const frontmatter: Record<string, unknown> = {
    name,
    description: manifest.description,
    ...(manifest.license !== "NOASSERTION" ? { license: manifest.license } : {}),
    ...(manifest.compatibility ? { compatibility: manifest.compatibility } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    ...(manifest.allowedTools?.length
      ? { "allowed-tools": manifest.allowedTools.join(" ") }
      : {}),
  };
  const skillMd = `---\n${stringify(frontmatter, { lineWidth: 0 })}---\n\n${manifest.instructions.trim()}\n`;
  return [
    { path: `${name}/SKILL.md`, bytes: new TextEncoder().encode(skillMd) },
    ...resources.map((r) => ({ path: `${name}/${r.path}`, bytes: r.bytes })),
  ];
}
