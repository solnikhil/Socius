import { Config } from "@remotion/cli/config";
import fs from "node:fs";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");

// Reuse the headless Chrome already downloaded for the TGOI film, if present.
const tgoiChrome =
  "/Users/rehaanajani/codebases/TGOI/launch-film/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell";
if (fs.existsSync(tgoiChrome)) Config.setBrowserExecutable(tgoiChrome);
