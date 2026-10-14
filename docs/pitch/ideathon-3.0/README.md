# Socius — CINTEL Ideathon 3.0

Team: **California Burrito** · Track: **AI Automation**

## Deliverables

- [Final PowerPoint](Socius_Ideathon_3.0_HQ_Final.pptx): seven filled slides, preserving the supplied template's layout, theme and colours.
- [Baymax transparent PNG](assets/Baymax_High_Quality_Transparent.png): 2000 × 1720 pixels, holding the red lollipop, no banner attached.
- [Separate SOCIUS banner](assets/Socius_Red_Banner.png): 2200 × 620 pixels, white comic lettering and black shadow on red. This banner is not placed in the final deck.
- [Muse](assets/Muse_Transparent.png), [Grok Bot](assets/Grok_Bot_Transparent.png) and [four dots characters](assets/Dots_Characters_Transparent.png): transparent PNG assets used on the solution slide. The dots image has no ChatGPT or dots wordmarks.
- `previews/`: rendered PNGs of all seven slides.
- `template/`: original supplied PowerPoint template.
- `source/`: editable slide-content authoring and template merge scripts, plus the architecture flowchart.
- `validation/presentation-checks.json`: package, slide geometry and import checks for the previous deck revision (commit f5d8202).
- `SHA256SUMS`: file checksums.

The final deck separates the problem from the proposed solution. The architecture diagram contains all 13 nodes and 12 directed edges supplied by the team, with editable PowerPoint shapes and connectors.

## Content snapshot

The presentation reflects the Notion brief read on 14 October 2026: [Socius Ideathon 3.0](https://app.notion.com/p/Socius-Ideathon-3-0-3f910c43ad3e81198b7bdf7be7bf6b06), and the prototype on `main`. Each slide leads with one judge-facing message: problem, solution, originality, architecture, feasibility and how it scales. Slide 5 marks built components with solid borders and next components with dashed borders, matching the root README's "What works" list. Two figures are cited in the speaker notes: UPI volume (NPCI, September 2026) and India's open-source contributor lead (GitHub Octoverse 2025). Each slide's speaker notes contain a 30–45 second presenter script.

## Rebuilding

Run from this directory. `source/build.mjs` requires Node.js with `@oai/artifact-tool` available in module resolution; it was authored in the Codex presentation runtime. It reads the checked-in PNG assets and writes `source/overlay.pptx`.

```sh
node source/build.mjs
python3 source/merge.py
```

To reapply the current slide copy, layout additions and speaker notes, run `python3 source/content.py <f5d8202 deck> <output>` with python-pptx installed.

The merge script writes `source/candidate.pptx` using the original template's backgrounds, masters, layouts and theme. The checked-in final deck was separately imported, rendered and validated; rerun equivalent validation after editing the sources.

## Artwork sources

The Baymax PNG was extracted from the [2000 × 3000 original poster](https://static.filmvandaag.nl/shows/original/8000/8142.jpg?v=1) hosted by [FilmVandaag](https://www.filmvandaag.nl/serie/8142-baymax), replacing the earlier screenshot cutout. It retains the original artwork and pose. Image regeneration was attempted but produced no usable result; the delivered asset uses the higher-resolution original.

The separate banner uses Bangers comic lettering, styled after the reference's white slanted lettering and black offset shadow; it is not an exact reproduction of custom Baymax logo lettering. [Bangers font source](https://github.com/google/fonts/tree/main/ofl/bangers).

Muse, Grok Bot and dots were cut out from the user's selected references. Original source URLs are recorded in slide 3's speaker notes. Third-party artwork belongs to its respective owners and illustrates product inspirations; it does not indicate partnerships. Baymax is the user-selected companion metaphor, not an original Socius character.
