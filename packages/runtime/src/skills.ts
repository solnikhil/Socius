import type { SkillManifest } from "@socius/contracts";
import type {
  Release,
  SkillAssignment,
  SkillAssignmentStatus,
  SkillAssignmentView,
  SkillReview,
  TaskSkill,
} from "@socius/contracts/app";
import { fail } from "./http.js";
import type { PackageService } from "./packages.js";
import type { Store } from "./store.js";

/**
 * Characters of always-load procedure text one bot may carry into every model call.
 * Procedures are never truncated to fit: over-budget activations are refused.
 */
export const ALWAYS_LOAD_BUDGET = 24_000;
const MAX_ASSIGNMENTS_PER_BOT = 50;
// One message for every reason a bot cannot use a skill, so a guessed package ID
// reveals nothing about what is installed or assigned to other bots.
const NOT_AVAILABLE = "That skill is not assigned to this bot";

type SkillRelease = Release & { manifest: SkillManifest };
export interface ResolvedSkill {
  assignment: SkillAssignment;
  release: SkillRelease;
}
/** What one model call may use: the bot's own assigned, enabled, valid skills. */
export interface SkillSession {
  /** On-demand skills: names and descriptions only, loaded through `loadSkill`. */
  skills: { id: string; name: string; description: string }[];
  /** Always-load procedures, in deterministic order, within the budget. */
  preloadedSkills: {
    id: string;
    name: string;
    version: string;
    instructions: string;
  }[];
  /** Always-load procedures left out because they no longer fit the budget. */
  omittedSkills: string[];
  loadSkill: (id: string) => { instructions: string; resources: string[] };
  readSkillResource: (id: string, path: string) => string;
}
const key = (botId: string, skillId: string) => `${botId}:${skillId}`;
const isSkill = (r: Release | undefined): r is SkillRelease =>
  r?.manifest.kind === "skill";

/**
 * Per-bot skill assignments and the single bot-scoped resolver. Install → assign →
 * activate → authorize → execute: an assignment only makes a reviewed procedure
 * available to one bot. It never adds tools, credentials or connector grants, which
 * the action broker keeps checking against the acting bot's own grants.
 *
 * Every caller that builds model context for a bot (direct chats, group coordinators
 * and members, and future approved delegation or routines) must go through
 * `session`, so a parent or coordinator never supplies another bot's procedures.
 */
export class SkillAssignments {
  constructor(
    private readonly store: Store,
    private readonly packages: PackageService,
  ) {
    // Migration 5 marks pre-assignment bots for review; suggest what they used to see.
    const installed = this.installedSkills().map((r) => r.manifest.id);
    for (const review of this.reviews()) {
      if (review.suggested) continue;
      if (!installed.length || !this.store.get("bot", review.botId))
        this.store.delete("skill-review", review.botId);
      else
        this.store.put("skill-review", review.botId, {
          ...review,
          suggested: installed,
        });
    }
  }

  private installedSkills(): SkillRelease[] {
    return this.packages.active("skill") as SkillRelease[];
  }
  all(): SkillAssignment[] {
    return this.store.all<SkillAssignment>("skill-assignment");
  }
  forBot(botId: string): SkillAssignment[] {
    return this.all().filter((a) => a.botId === botId);
  }
  get(botId: string, skillId: string): SkillAssignment | undefined {
    return this.store.get<SkillAssignment>(
      "skill-assignment",
      key(botId, skillId),
    );
  }
  /** Assignments of one package, for uninstall and update review. */
  affected(skillId: string): SkillAssignment[] {
    return this.all().filter((a) => a.skillId === skillId);
  }

  private evaluate(a: SkillAssignment): {
    status: SkillAssignmentStatus;
    detail: string;
    release?: SkillRelease;
    installed: { version: string; digest: string } | null;
  } {
    const receipt = this.packages.installation(a.skillId);
    if (!receipt)
      return {
        status: "unavailable",
        detail: "This skill is no longer installed.",
        installed: null,
      };
    const release = this.packages.installedRelease(a.skillId);
    if (!isSkill(release))
      return {
        status: "unavailable",
        detail: "The installed release failed verification.",
        installed: null,
      };
    const installed =
      release.digest === a.release.digest
        ? null
        : { version: release.manifest.version, digest: release.digest };
    if (!receipt.enabled)
      return {
        status: "unavailable",
        detail: "This skill is turned off for the whole workspace.",
        installed,
      };
    if (installed)
      return {
        status: "needs-review",
        detail: `Version ${release.manifest.version} is installed; this bot was set up with ${a.release.version}. Review the new release before the bot uses it.`,
        installed,
      };
    if (!a.enabled)
      return {
        status: "off",
        detail: "Turned off for this bot.",
        installed: null,
      };
    return { status: "ready", detail: "Ready.", release, installed: null };
  }
  private pinned(a: SkillAssignment): SkillManifest | undefined {
    const r = this.packages.catalog.release(a.skillId, a.release.version);
    return isSkill(r) && r.digest === a.release.digest ? r.manifest : undefined;
  }
  view(a: SkillAssignment): SkillAssignmentView {
    const { status, detail, installed } = this.evaluate(a);
    const manifest = this.pinned(a);
    const ready = new Set(
      this.usable(a.botId).map((s) => s.assignment.skillId),
    );
    return {
      ...a,
      status,
      detail,
      installed,
      name: manifest?.name ?? a.skillId.split("/")[1]!,
      description: manifest?.description ?? "",
      instructionChars: manifest?.instructions.length ?? 0,
      missingDependencies: (manifest?.dependencies ?? [])
        .filter((d) => isSkill(this.packages.catalog.release(d.id, d.version)))
        .map((d) => d.id)
        .filter((id) => !ready.has(id)),
    };
  }
  views(botId?: string): SkillAssignmentView[] {
    return (botId ? this.forBot(botId) : this.all()).map((a) => this.view(a));
  }

  /** The bot's ready skills in deterministic order: oldest assignment first, then ID. */
  usable(botId: string): ResolvedSkill[] {
    const out: ResolvedSkill[] = [];
    for (const assignment of this.forBot(botId)) {
      const { release } = this.evaluate(assignment);
      if (release) out.push({ assignment, release });
    }
    return out.sort(
      (a, b) =>
        a.assignment.createdAt.localeCompare(b.assignment.createdAt) ||
        a.assignment.skillId.localeCompare(b.assignment.skillId),
    );
  }
  /** Rechecks assignment and install state now; used on every load and read. */
  resolve(botId: string, skillId: string): ResolvedSkill {
    const found = this.usable(botId).find(
      (s) => s.assignment.skillId === skillId,
    );
    return found ?? fail(404, NOT_AVAILABLE);
  }

  private alwaysLoadChars(botId: string, except: string) {
    return this.forBot(botId)
      .filter((a) => a.activation === "always-load" && a.skillId !== except)
      .reduce((n, a) => n + (this.pinned(a)?.instructions.length ?? 0), 0);
  }
  private checkBudget(botId: string, skillId: string, instructions: string) {
    const total = this.alwaysLoadChars(botId, skillId) + instructions.length;
    if (total > ALWAYS_LOAD_BUDGET)
      fail(
        409,
        `Always-load procedures for this bot would add ${total} characters to every message, over the ${ALWAYS_LOAD_BUDGET} limit. Use on-demand loading instead.`,
      );
  }
  private checkRevision(a: SkillAssignment, revision: number | undefined) {
    if (revision !== undefined && revision !== a.revision)
      fail(
        409,
        "This skill assignment changed since you loaded it. Refresh and try again.",
      );
  }
  private save(a: SkillAssignment) {
    this.store.put("skill-assignment", key(a.botId, a.skillId), a);
  }

  /** Assigns the installed release of a skill. Repeating the same request is a no-op. */
  assign(input: {
    botId: string;
    skillId: string;
    activation: SkillAssignment["activation"];
    enabled: boolean;
  }): { assignment: SkillAssignmentView; created: boolean } {
    const receipt =
      this.packages.installation(input.skillId) ??
      fail(404, "That skill is not installed");
    const release = this.packages.installedRelease(input.skillId);
    if (!isSkill(release)) return fail(404, "That skill is not installed");
    if (!receipt.enabled)
      fail(409, "Turn this skill on for the workspace before assigning it");
    this.packages.verifyFiles(release);
    const existing = this.get(input.botId, input.skillId);
    if (existing) {
      if (
        existing.release.digest === release.digest &&
        existing.activation === input.activation &&
        existing.enabled === input.enabled
      )
        return { assignment: this.view(existing), created: false };
      return fail(
        409,
        "This skill is already assigned to this bot. Change it with its current revision.",
      );
    }
    if (this.forBot(input.botId).length >= MAX_ASSIGNMENTS_PER_BOT)
      fail(409, `A bot can have at most ${MAX_ASSIGNMENTS_PER_BOT} skills`);
    if (input.activation === "always-load")
      this.checkBudget(
        input.botId,
        input.skillId,
        release.manifest.instructions,
      );
    const now = new Date().toISOString();
    const assignment: SkillAssignment = {
      botId: input.botId,
      skillId: input.skillId,
      release: { version: release.manifest.version, digest: release.digest },
      enabled: input.enabled,
      activation: input.activation,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.store.transaction(() => {
      this.save(assignment);
      this.store.event(
        "skill.assigned",
        `Assigned ${release.manifest.name} ${release.manifest.version} to a bot. No permissions were granted.`,
      );
    });
    return { assignment: this.view(assignment), created: true };
  }

  update(input: {
    botId: string;
    skillId: string;
    revision: number;
    activation?: SkillAssignment["activation"] | undefined;
    enabled?: boolean | undefined;
  }): SkillAssignmentView {
    const a =
      this.get(input.botId, input.skillId) ??
      fail(404, "That skill is not assigned to this bot");
    this.checkRevision(a, input.revision);
    const activation = input.activation ?? a.activation;
    const enabled = input.enabled ?? a.enabled;
    if (activation === a.activation && enabled === a.enabled)
      return this.view(a);
    if (activation === "always-load" && a.activation !== "always-load")
      this.checkBudget(a.botId, a.skillId, this.pinned(a)?.instructions ?? "");
    const next: SkillAssignment = {
      ...a,
      activation,
      enabled,
      revision: a.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.store.transaction(() => {
      this.save(next);
      this.store.event(
        "skill.assignment-updated",
        `Updated a bot's ${a.skillId} skill: ${enabled ? "on" : "off"}, ${activation}.`,
      );
    });
    return this.view(next);
  }

  /** Accepts the currently installed release after the user reviewed it. */
  review(input: {
    botId: string;
    skillId: string;
    revision: number;
    release: { version: string; digest: string };
  }): SkillAssignmentView {
    const a =
      this.get(input.botId, input.skillId) ??
      fail(404, "That skill is not assigned to this bot");
    this.checkRevision(a, input.revision);
    const release = this.packages.installedRelease(a.skillId);
    if (
      !isSkill(release) ||
      release.digest !== input.release.digest ||
      release.manifest.version !== input.release.version
    )
      return fail(
        409,
        "The installed release is not the one you reviewed. Review it again.",
      );
    if (a.release.digest === release.digest) return this.view(a);
    this.packages.verifyFiles(release);
    if (a.activation === "always-load")
      this.checkBudget(a.botId, a.skillId, release.manifest.instructions);
    const next: SkillAssignment = {
      ...a,
      release: { version: release.manifest.version, digest: release.digest },
      revision: a.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.store.transaction(() => {
      this.save(next);
      this.store.event(
        "skill.assignment-reviewed",
        `A bot now uses ${release.manifest.name} ${release.manifest.version} after review.`,
      );
    });
    return this.view(next);
  }

  /** Removes an assignment. Repeating it is a no-op. */
  unassign(input: {
    botId: string;
    skillId: string;
    revision?: number | undefined;
  }) {
    const a = this.get(input.botId, input.skillId);
    if (!a) return { removed: false };
    this.checkRevision(a, input.revision);
    this.store.transaction(() => {
      this.store.delete("skill-assignment", key(a.botId, a.skillId));
      this.store.event("skill.unassigned", `Removed ${a.skillId} from a bot.`);
    });
    return { removed: true };
  }
  /** Removes every assignment of a package. Runs inside the uninstall transaction. */
  detach(skillId: string) {
    for (const a of this.affected(skillId))
      this.store.delete("skill-assignment", key(a.botId, a.skillId));
  }
  /** Removes a deleted bot's assignments and review. Runs inside its transaction. */
  removeBot(botId: string) {
    for (const a of this.forBot(botId))
      this.store.delete("skill-assignment", key(a.botId, a.skillId));
    this.store.delete("skill-review", botId);
  }

  reviews(): SkillReview[] {
    return this.store.all<SkillReview>("skill-review");
  }
  /** Records template-declared skills as suggestions for explicit review. */
  suggest(botId: string, skillIds: string[]) {
    if (!skillIds.length) return;
    this.store.put("skill-review", botId, {
      botId,
      reason: "template",
      suggested: skillIds,
      createdAt: new Date().toISOString(),
    } satisfies SkillReview);
  }
  dismissReview(botId: string) {
    this.store.delete("skill-review", botId);
    return { ok: true };
  }

  /**
   * Freezes the bot's usable skills for one model call. Loads and reads recheck the
   * live assignment every time and refuse a release that changed since the snapshot.
   * `record` receives activation evidence for the task.
   */
  session(botId: string, record: (evidence: TaskSkill) => void): SkillSession {
    const snapshot = new Map(
      this.usable(botId).map((s) => [s.assignment.skillId, s] as const),
    );
    const evidence = (s: ResolvedSkill, loaded: boolean) =>
      record({
        botId,
        skillId: s.assignment.skillId,
        version: s.release.manifest.version,
        digest: s.release.digest,
        activation: s.assignment.activation,
        loaded,
      });
    const preloadedSkills: SkillSession["preloadedSkills"] = [];
    const omittedSkills: string[] = [];
    let used = 0;
    for (const s of snapshot.values()) {
      if (s.assignment.activation !== "always-load") continue;
      const text = s.release.manifest.instructions;
      if (used + text.length > ALWAYS_LOAD_BUDGET) {
        omittedSkills.push(s.release.manifest.name);
        evidence(s, false);
        continue;
      }
      used += text.length;
      preloadedSkills.push({
        id: s.assignment.skillId,
        name: s.release.manifest.name,
        version: s.release.manifest.version,
        instructions: text,
      });
      evidence(s, true);
    }
    const skills = [...snapshot.values()]
      .filter((s) => s.assignment.activation === "on-demand")
      .map((s) => {
        evidence(s, false);
        return {
          id: s.assignment.skillId,
          name: s.release.manifest.name,
          description: s.release.manifest.description,
        };
      });
    const current = (id: string) => {
      const frozen = snapshot.get(id) ?? fail(404, NOT_AVAILABLE);
      const live = this.resolve(botId, id);
      if (live.release.digest !== frozen.release.digest)
        fail(409, "This skill changed during the task and needs review");
      return live;
    };
    const loaded = new Set<string>();
    return {
      skills,
      preloadedSkills,
      omittedSkills,
      loadSkill: (id) => {
        const s = current(id);
        this.packages.verifyFiles(s.release);
        const resources = (s.release.manifest.resources ?? [])
          .filter((r) => r.kind === "reference")
          .map((r) => r.path);
        if (loaded.has(id))
          return {
            instructions:
              "Already loaded earlier in this conversation turn; follow the instructions returned then.",
            resources,
          };
        loaded.add(id);
        evidence(s, true);
        return { instructions: s.release.manifest.instructions, resources };
      },
      readSkillResource: (id, path) =>
        this.packages.resourceText(current(id).release, path),
    };
  }
}
