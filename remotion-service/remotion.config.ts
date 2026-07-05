import path from "node:path";
import { Config } from "@remotion/cli/config";

const root = process.cwd();

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);

Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(typeof config.resolve?.alias === "object" && !Array.isArray(config.resolve.alias)
        ? config.resolve.alias
        : {}),
      "@types/theme-tokens": path.join(root, "src/types/theme-tokens.ts"),
      "@types/audio-analysis": path.join(root, "src/types/audio-analysis.ts"),
      "@components": path.join(root, "src/motion/components"),
      "@lib": path.join(root, "src/lib"),
    },
  },
}));
