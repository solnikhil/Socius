import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  BotManifest as BotManifestSchema,
  type BotInstance,
  type BotManifest,
  type Capability,
  type Manifest,
  type ReleaseSource,
  type SkillManifest,
  type TrustStatus,
} from "@socius/contracts";
import type {
  BotExportDraft,
  ExportPreview,
  Installation,
  InstallPreview,
  Memory,
  Release,
} from "@socius/contracts/app";
import {
  Catalog,
  digestOf,
  exportBotTemplate,
  newCapabilities,
  reviewText,
  slug,
} from "@socius/marketplace";
import { curatedReleases } from "@socius/marketplace/curated";
import {
  parseSkillFiles,
  serializeSkill,
  sha256,
  SkillImportError,
  type SkillFileEntry,
} from "@socius/skills";
import { reviewedConnector, verifyManifest } from "@socius/connectors";
import type { Store } from "./store.js";

export class PackageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new PackageError(status, message);
};
interface StoredRelease {
  digest: string;
  manifest: Manifest;
  source: ReleaseSource;
  trust: TrustStatus;
  importedAt: string;
}
const MAX_RESOURCE_TEXT = 64 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const sorted = (values: Iterable<Capability>) => [...new Set(values)].sort();

export class PackageService {
  readonly catalog: Catalog;
  constructor(private readonly store: Store) {
    this.catalog = new Catalog([], curatedReleases);
    for (const r of store.all<StoredRelease>("release")) {
      try {
        this.catalog.add(r);
      } catch {
        store.event(
          "package.skipped",
          "A stored release failed validation and was not loaded.",
        );
      }
    }
  }
  releases(): Release[] {
    return this.catalog.releases();
  }
  installation(id: string) {
    return this.store.get<Installation>("installation", id);
  }
  installedRelease(id: string): Release | undefined {
    const receipt = this.installation(id);
    const release =
      receipt && this.catalog.release(receipt.id, receipt.version);
    return release && release.digest === receipt.digest ? release : undefined;
  }
  /** Installed, enabled and intact releases of a kind; disabled packages are unusable. */
  active<K extends Manifest["kind"]>(
    kind: K,
  ): (Release & { manifest: Extract<Manifest, { kind: K }> })[] {
    return this.store
      .all<Installation>("installation")
      .filter((i) => i.enabled)
      .map((i) => this.installedRelease(i.id))
      .filter(
        (r): r is Release & { manifest: Extract<Manifest, { kind: K }> } =>
          !!r && r.manifest.kind === kind,
      );
  }

  private plan(id: string, version: string) {
    try {
      return this.catalog.planInstall(id, version);
    } catch (error) {
      return fail(409, (error as Error).message);
    }
  }
  preview(id: string, version: string): InstallPreview {
    const plan = this.plan(id, version);
    const packages = plan.releases.map((r) => {
      const receipt = this.installation(r.manifest.id);
      return {
        manifest: r.manifest,
        digest: r.digest,
        source: r.source,
        trust: r.trust,
        installed: receipt
          ? { version: receipt.version, digest: receipt.digest }
          : null,
      };
    });
    const fresh = sorted(
      plan.releases.flatMap((r) =>
        newCapabilities(
          r.manifest.capabilities,
          this.installation(r.manifest.id)?.consentedCapabilities ?? [],
        ),
      ),
    );
    return {
      packages,
      requestedCapabilities: plan.requestedCapabilities,
      newCapabilities: fresh,
      grantsPermissions: false,
      digest: digestOf({
        releases: plan.releases.map((r) => ({
          id: r.manifest.id,
          version: r.manifest.version,
          digest: r.digest,
        })),
        requestedCapabilities: plan.requestedCapabilities,
      }),
    };
  }

  /** Re-hashes stored files so on-disk tampering is detected before activation. */
  verifyFiles(release: Release) {
    if (release.manifest.kind !== "skill") return;
    for (const resource of release.manifest.resources ?? []) {
      const path = join(
        this.store.releasesDir,
        release.digest,
        ...resource.path.split("/"),
      );
      let bytes: Buffer;
      try {
        bytes = readFileSync(path);
      } catch {
        return fail(409, `Package file is missing: ${resource.path}`);
      }
      if (sha256(bytes) !== resource.sha256)
        fail(409, `Package file failed its integrity check: ${resource.path}`);
    }
  }

  install(
    input: {
      id: string;
      version: string;
      digest: string;
      consent: Capability[];
    },
    createBot: (template: BotManifest) => BotInstance,
  ) {
    const preview = this.preview(input.id, input.version);
    if (preview.digest !== input.digest)
      fail(409, "The installation plan changed. Review it again.");
    const missing = preview.newCapabilities.filter(
      (c) => !input.consent.includes(c),
    );
    if (missing.length)
      fail(
        409,
        `Consent is required for newly requested permissions: ${missing.join(", ")}`,
      );
    const plan = this.plan(input.id, input.version);
    // Exact dependencies: replacing an installed version must not break another
    // installed package that pins the current one.
    const planned = new Set(plan.releases.map((r) => r.manifest.id));
    for (const release of plan.releases) {
      const prior = this.installation(release.manifest.id);
      if (!prior || prior.version === release.manifest.version) continue;
      const blockers = this.store
        .all<Installation>("installation")
        .filter((i) => !planned.has(i.id))
        .filter((i) =>
          this.catalog
            .release(i.id, i.version)
            ?.manifest.dependencies.some(
              (d) =>
                d.id === release.manifest.id && d.version === prior.version,
            ),
        )
        .map((i) => i.id);
      if (blockers.length)
        fail(
          409,
          `Version conflict: ${blockers.join(", ")} requires ${release.manifest.id}@${prior.version}, but this installs ${release.manifest.version}`,
        );
    }
    for (const release of plan.releases) {
      this.verifyFiles(release);
      if (release.manifest.kind === "connector") {
        if (release.trust === "local-unverified")
          fail(409, "Unreviewed connectors cannot be installed");
        if (
          !reviewedConnector(release.manifest.id) ||
          verifyManifest(release.manifest).length
        )
          fail(
            409,
            `${release.manifest.name} has no matching reviewed runtime implementation`,
          );
      }
    }
    const now = new Date().toISOString();
    const root = plan.releases.at(-1)!;
    this.store.transaction(() => {
      for (const release of plan.releases) {
        const p = release.manifest;
        const prior = this.installation(p.id);
        const same =
          prior &&
          prior.version === p.version &&
          prior.digest === release.digest;
        const receipt: Installation = same
          ? prior
          : {
              id: p.id,
              version: p.version,
              digest: release.digest,
              installedAt: now,
              enabled: prior?.enabled ?? true,
              source: release.source,
              trust: release.trust,
              consentedCapabilities: sorted(p.capabilities),
              history: prior
                ? [
                    ...prior.history,
                    {
                      version: prior.version,
                      digest: prior.digest,
                      installedAt: prior.installedAt,
                    },
                  ].slice(-10)
                : [],
            };
        this.store.put("installation", p.id, receipt);
        if (prior && !same)
          this.store.event(
            "package.updated",
            `Updated ${p.name} from ${prior.version} to ${p.version}.`,
          );
      }
      if (root.manifest.kind === "bot") createBot(root.manifest);
      this.store.event(
        "package.installed",
        `Installed ${root.manifest.name} ${root.manifest.version}. No bot permissions were granted.`,
      );
    });
    return { ok: true };
  }

  setEnabled(id: string, enabled: boolean) {
    const receipt =
      this.installation(id) ?? fail(404, "Package is not installed");
    receipt.enabled = enabled;
    this.store.put("installation", id, receipt);
    this.store.event(
      enabled ? "package.enabled" : "package.disabled",
      `${enabled ? "Enabled" : "Disabled"} ${id}.`,
    );
    return receipt;
  }

  dependents(id: string) {
    return this.store
      .all<Installation>("installation")
      .filter((i) => i.id !== id)
      .filter((i) =>
        this.catalog
          .release(i.id, i.version)
          ?.manifest.dependencies.some((d) => d.id === id),
      )
      .map((i) => i.id);
  }

  uninstall(id: string) {
    const receipt =
      this.installation(id) ?? fail(404, "Package is not installed");
    const dependents = this.dependents(id);
    if (dependents.length)
      fail(409, `Required by ${dependents.join(", ")}. Uninstall those first.`);
    this.store.remove("installation", id);
    this.store.event(
      "package.uninstalled",
      `Uninstalled ${id} ${receipt.version}.`,
    );
  }

  rollback(id: string) {
    const receipt =
      this.installation(id) ?? fail(404, "Package is not installed");
    const previous =
      receipt.history.at(-1) ?? fail(409, "No earlier release to roll back to");
    const release = this.catalog.release(id, previous.version);
    if (!release || release.digest !== previous.digest)
      fail(409, "The earlier release is no longer available");
    const extra = newCapabilities(
      release!.manifest.capabilities,
      receipt.consentedCapabilities,
    );
    if (extra.length)
      fail(
        409,
        `The earlier release requests ${extra.join(", ")}; install it from the catalog to consent`,
      );
    for (const d of release!.manifest.dependencies) {
      const dep = this.installation(d.id);
      if (!dep || dep.version !== d.version)
        fail(
          409,
          `The earlier release needs ${d.id}@${d.version}; install it from the catalog`,
        );
    }
    this.verifyFiles(release!);
    const rolled: Installation = {
      ...receipt,
      version: previous.version,
      digest: previous.digest,
      installedAt: new Date().toISOString(),
      consentedCapabilities: sorted(release!.manifest.capabilities),
      history: receipt.history.slice(0, -1),
    };
    this.store.put("installation", id, rolled);
    this.store.event(
      "package.rolled-back",
      `Rolled ${id} back to ${previous.version}.`,
    );
    return rolled;
  }

  private addRelease(
    manifest: Manifest,
    source: ReleaseSource,
    files?: { path: string; bytes: Uint8Array }[],
  ): Release {
    const existing = this.catalog.release(manifest.id, manifest.version);
    const candidate: StoredRelease = {
      digest: "",
      manifest,
      source,
      trust: "local-unverified",
      importedAt: new Date().toISOString(),
    };
    if (existing) {
      if (existing.digest === digestOf(manifest)) return existing;
      fail(
        409,
        `${manifest.id}@${manifest.version} already exists with different content. Release identities are immutable: bump metadata.version to import an update.`,
      );
    }
    candidate.digest = digestOf(manifest);
    const target = join(this.store.releasesDir, candidate.digest);
    if (files?.length && !existsSync(target)) {
      // Stage, verify, then atomically move into the content-addressed store.
      const staging = join(this.store.stagingDir, randomUUID());
      try {
        for (const f of files) {
          const path = join(staging, ...f.path.split("/"));
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, f.bytes, { mode: 0o600 });
        }
        for (const f of files)
          if (
            sha256(readFileSync(join(staging, ...f.path.split("/")))) !==
            sha256(f.bytes)
          )
            fail(500, "Staged file verification failed");
        renameSync(staging, target);
      } finally {
        rmSync(staging, { recursive: true, force: true });
      }
    }
    const release = this.catalog.add(candidate);
    this.store.put("release", candidate.digest, candidate);
    return release;
  }

  importSkill(entries: SkillFileEntry[], label: string) {
    let parsed;
    try {
      parsed = parseSkillFiles(entries);
    } catch (error) {
      if (error instanceof SkillImportError) return fail(400, error.message);
      throw error;
    }
    const resources = parsed.files.filter((f) => f.path !== "SKILL.md");
    const release = this.addRelease(
      parsed.manifest,
      { type: "local-import", label: label.slice(0, 200) || "Local folder" },
      resources,
    );
    this.store.event(
      "package.imported",
      `Imported skill ${release.manifest.name} ${release.manifest.version} for review.`,
    );
    return { release, ignored: parsed.ignored };
  }

  importTemplate(input: unknown, label: string) {
    const parsed = BotManifestSchema.safeParse(input);
    if (!parsed.success)
      fail(400, "This file is not a valid Socius bot template");
    const release = this.addRelease(parsed.data!, {
      type: "local-import",
      label: label.slice(0, 200) || "Template file",
    });
    this.store.event(
      "package.imported",
      `Imported bot template ${release.manifest.name} for review.`,
    );
    return { release };
  }

  /** Progressive disclosure: a reference file is read only when a bot asks for it. */
  resourceText(release: Release, path: string): string {
    const manifest = release.manifest as SkillManifest;
    const resource = manifest.resources?.find((r) => r.path === path);
    if (!resource) fail(404, "That skill has no such resource");
    if (resource!.kind !== "reference")
      fail(403, "Only reference documents can be read; scripts stay inert");
    if (resource!.size > MAX_RESOURCE_TEXT)
      fail(413, "Resource is too large to load");
    const bytes = readFileSync(
      join(this.store.releasesDir, release.digest, ...path.split("/")),
    );
    if (sha256(bytes) !== resource!.sha256)
      fail(409, "Resource failed its integrity check");
    try {
      return utf8.decode(bytes);
    } catch {
      return fail(415, "Resource is not UTF-8 text");
    }
  }

  private skillFiles(release: Release) {
    const manifest = release.manifest as SkillManifest;
    this.verifyFiles(release);
    return serializeSkill(
      manifest,
      (manifest.resources ?? []).map((r) => ({
        path: r.path,
        bytes: readFileSync(
          join(this.store.releasesDir, release.digest, ...r.path.split("/")),
        ),
      })),
    );
  }
  exportSkillPreview(id: string, version: string): ExportPreview {
    const release = this.catalog.release(id, version);
    if (!release || release.manifest.kind !== "skill")
      return fail(404, "Skill not found");
    let files;
    try {
      files = this.skillFiles(release);
    } catch (error) {
      if (error instanceof SkillImportError) return fail(409, error.message);
      throw error;
    }
    const view = files.map((f) => {
      try {
        return { path: f.path, content: utf8.decode(f.bytes) };
      } catch {
        return {
          path: f.path,
          content: `[binary file, ${f.bytes.byteLength} bytes]`,
        };
      }
    });
    return {
      kind: "skill",
      files: view,
      findings: reviewText(
        Object.fromEntries(view.map((f) => [f.path, f.content])),
      ),
      digest: digestOf(view),
    };
  }
  exportSkill(
    id: string,
    version: string,
    digest: string,
    acknowledged: boolean,
  ) {
    const preview = this.exportSkillPreview(id, version);
    if (preview.digest !== digest)
      fail(409, "The export changed. Review it again.");
    if (preview.findings.length && !acknowledged)
      fail(409, "Review the flagged text before exporting");
    const release = this.catalog.release(id, version)!;
    const dir = join(
      this.store.exportsDir,
      `${Date.now()}-${slug(release.manifest.name)}`,
    );
    for (const f of this.skillFiles(release)) {
      const path = join(dir, ...f.path.split("/"));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, f.bytes);
    }
    this.store.event(
      "package.exported",
      `Exported skill ${release.manifest.name} after review.`,
    );
    return { path: join(dir, id.split("/")[1]!) };
  }

  botExportPreview(
    bot: BotInstance,
    draft: BotExportDraft,
    memory: Memory[],
  ): ExportPreview & { manifest: BotManifest } {
    const template = this.catalog.release(
      bot.template.id,
      bot.template.version,
    )?.manifest;
    let manifest: BotManifest;
    try {
      manifest = exportBotTemplate(
        draft,
        template?.kind === "bot" ? template : undefined,
        this.store.all<Installation>("installation"),
      );
    } catch {
      return fail(
        400,
        "Check the template fields: name, role, instructions, a 1.2.3 version and a license are required",
      );
    }
    const content = `${JSON.stringify(manifest, null, 2)}\n`;
    const files = [{ path: `${slug(manifest.name)}.socius-bot.json`, content }];
    return {
      kind: "bot",
      manifest,
      files,
      findings: reviewText(
        {
          name: manifest.name,
          description: manifest.description,
          role: manifest.role,
          instructions: manifest.instructions,
        },
        memory.map((m) => m.content),
      ),
      digest: digestOf(files),
    };
  }
  exportBot(
    bot: BotInstance,
    draft: BotExportDraft,
    memory: Memory[],
    digest: string,
    acknowledged: boolean,
  ) {
    const preview = this.botExportPreview(bot, draft, memory);
    if (preview.digest !== digest)
      fail(409, "The export changed. Review it again.");
    if (preview.findings.length && !acknowledged)
      fail(409, "Review the flagged text before exporting");
    const file = preview.files[0]!;
    const path = join(this.store.exportsDir, `${Date.now()}-${file.path}`);
    writeFileSync(path, file.content);
    this.store.event(
      "bot.exported",
      `Exported a reusable template from ${bot.name} after review.`,
    );
    return { path, file };
  }
}
