import React from "react";
import { Composition } from "remotion";
import { Film } from "./Film";
import { loadFonts } from "./fonts";
import TL from "./timeline.json";

loadFonts();

export const RemotionRoot: React.FC = () => (
  <Composition
    id="SociusPromo"
    component={Film}
    durationInFrames={TL.durationInFrames}
    fps={TL.fps}
    width={1920}
    height={1080}
    defaultProps={{ withAudio: true }}
  />
);
