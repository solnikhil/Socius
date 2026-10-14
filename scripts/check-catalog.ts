import { Catalog, instantiateBot, mainBot } from "@socius/marketplace";
const catalog = new Catalog([mainBot]);
console.log(
  JSON.stringify(
    {
      sections: {
        skillsAndConnectors: catalog.list("skills-and-connectors").length,
        bots: catalog.list("bots").length,
      },
      plan: catalog.planInstall(mainBot.id, mainBot.version),
      bot: instantiateBot(mainBot),
    },
    null,
    2,
  ),
);
