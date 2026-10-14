// Deterministic model, Notion and registry fixtures only for end-to-end tests. Production never selects them.
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startRuntime } from "../packages/runtime/src/server.js";
import { startNotionFixture } from "../packages/connectors/test/fixture.js";
const dir = await mkdtemp(join(tmpdir(), "socius-e2e-"));
const notion = await startNotionFixture();
const PARENT = "11111111-1111-1111-1111-111111111111";
const registryPage = {
  servers: [
    {
      server: {
        name: "com.notion/mcp",
        description: "Official Notion MCP server",
        version: "1.0.1",
        remotes: [
          { type: "streamable-http", url: "https://mcp.notion.com/mcp" },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          isLatest: true,
        },
      },
    },
    {
      server: {
        name: "io.example/unreviewed",
        description: "A server Socius has not reviewed",
        version: "0.3.0",
        packages: [{ registryType: "npm", identifier: "example-mcp" }],
      },
    },
  ],
  metadata: {},
};
const runtime = await startRuntime({
  dataDir: dir,
  webDir: resolve("dist/web"),
  port: 3137,
  // Test-only reversible box standing in for OS-backed encryption.
  secretBox: {
    encrypt: async (v) => `sealed:${Buffer.from(v).toString("base64")}`,
    decrypt: async (v) => Buffer.from(v.slice(7), "base64").toString(),
  },
  connectorEndpoints: { "socius/notion": `${notion.url}/mcp` },
  registry: {
    fetch: (async () =>
      new Response(JSON.stringify(registryPage))) as unknown as typeof fetch,
  },
  runner: async (request, onText) => {
    const content = String(request.messages.at(-1)?.content);
    // Group chats: the coordinator asks its first member, then sums up.
    if (request.askMember) {
      // "flaky" fails the first attempt so the UI can offer a retry.
      if (
        content.includes("flaky") &&
        !request.briefing?.includes("did not finish")
      )
        throw new Error("fetch failed");
      const member = /^- ([^:]+):/m.exec(request.briefing ?? "")?.[1] ?? "";
      await request.askMember(member, "Outline the three launch steps.");
      const text = `Thanks, ${member}. Start with step one this week; I'll check in after.`;
      onText(text);
      return text;
    }
    if (request.briefing?.includes("is asking you directly")) {
      const text = `${request.bot.name} here. 1. Research the audience. 2. Draft the announcement. 3. Schedule the launch.`;
      onText(text);
      return text;
    }
    if (content.toLowerCase().includes("brief")) {
      const tool = (name: string) =>
        request.connectorTools?.find((t) => t.name === name);
      const skill = request.skills.find((s) => s.name === "document-brief");
      if (skill) request.loadSkill(skill.id);
      const search = tool("notion_search");
      const found = search
        ? JSON.stringify(await search.execute({ query: "planning" }))
        : "";
      const propose = tool("notion_propose_page");
      if (propose)
        await propose.execute({
          parentPage: PARENT,
          title: "Q3 brief",
          content: "## Findings\n- Ship connectors [Q3 planning]",
        });
      const text = found.includes("Q3 planning")
        ? "From Q3 planning: ship connectors. I proposed a “Q3 brief” page for your approval."
        : "I could not read your workspace.";
      onText(text);
      return text;
    }
    if (content.toLowerCase().includes("create"))
      request.proposeBot?.({
        name: "Planner",
        role: "Planning specialist",
        instructions: "Make grounded plans from supplied context.",
      });
    const text = content.toLowerCase().includes("create")
      ? "I proposed a Planner bot. Review it below."
      : "Here is the summary of your supplied document: the team is building Socius.";
    onText(text);
    return text;
  },
});
await mkdir("test-results", { recursive: true });
await writeFile("test-results/pairing-url", runtime.pairingURL);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(
    signal,
    () =>
      void runtime
        .close()
        .then(() => notion.close())
        .then(() => rm(dir, { recursive: true, force: true }))
        .then(() => process.exit(0)),
  );
