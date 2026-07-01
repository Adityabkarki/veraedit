import React from "react";
import { Composition } from "remotion";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadNotoDevanagari } from "@remotion/google-fonts/NotoSansDevanagari";
import { CaptionComposition } from "./CaptionComposition";
import { TitleCardComposition } from "./TitleCardComposition";

const { fontFamily: montserratFamily } = loadMontserrat("normal", {
  weights: ["700", "800"],
  subsets: ["latin"],
});

const { fontFamily: notoFamily } = loadNotoDevanagari("normal", {
  weights: ["700"],
  subsets: ["devanagari"],
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="CaptionOverlay"
      component={CaptionComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        words: [],
        style: "hormozi" as const,
        fontFamily: montserratFamily,
      }}
    />
    <Composition
      id="TitleCardOverlay"
      component={TitleCardComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        text: "",
        startSeconds: 0,
        endSeconds: 3,
        fontFamily: montserratFamily,
        brandColor: "#3b82f6",
      }}
    />
  </>
);

export const FONT_FAMILIES = {
  montserrat: montserratFamily,
  notoDevanagari: notoFamily,
};
