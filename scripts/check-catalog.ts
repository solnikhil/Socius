import { resolve } from "node:path";
import { Catalog, instantiateBot, mainBot } from "@socius/marketplace";
import { curatedReleases } from "@socius/marketplace/curated";
import { verifyManifest } from "@socius/connectors";
import { parseSkillFiles, readSkillDirectory } from "@socius/skills";

// Every curated release must parse, resolve and, for connectors, match reviewed code.
const catalog = new Catalog([], curatedReleases);
const problems: string[] = [];
for (const release of catalog.releases()) {
  const { manifest } = release;
  try {
    catalog.planInstall(manifest.id, manifest.version);
  } catch (error) {
    problems.push(`${manifest.id}: ${(error as Error).message}`);
  }
  if (manifest.kind === "connector") problems.push(...verifyManifest(manifest));
}
const example = parseSkillFiles(
  await readSkillDirectory(resolve("examples/skills/document-brief")),
);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      sections: {
        skillsAndConnectors: catalog.list("skills-and-connectors").length,
        bots: catalog.list("bots").length,
      },
      releases: catalog.releases().map((r) => ({
        id: r.manifest.id,
        version: r.manifest.version,
        trust: r.trust,
        source: r.source.type,
        digest: r.digest.slice(0, 12),
      })),
      exampleSkill: {
        id: example.manifest.id,
        version: example.manifest.version,
        resources: example.manifest.resources?.length ?? 0,
      },
      plan: catalog.planInstall(mainBot.id, mainBot.version).requestedCapabilities,
      bot: instantiateBot(mainBot).grantedCapabilities,
    },
    null,
    2,
  ),
);
