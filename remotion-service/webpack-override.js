/**
 * Shared webpack alias override — used by BOTH remotion.config.ts (CLI renders)
 * and server.js (runtime bundle for /render-director). Keep the two in sync by
 * only ever editing this file.
 *
 * Every `@types/<name>` alias must map to a concrete file in src/types/ —
 * webpack must resolve value imports (e.g. buildKenBurnsMotion from
 * @types/camera-motion), not just type-only imports.
 */
const path = require("node:path");

// process.cwd(), not __dirname: the Remotion CLI inlines this file when
// bundling remotion.config.ts, which rewrites __dirname to the bundle dir.
// Both the CLI and server.js run with remotion-service/ as the working dir.
const root = process.cwd();

const ALIASES = {
  "@types/audio-analysis": path.join(root, "src/types/audio-analysis.ts"),
  "@types/camera-motion": path.join(root, "src/types/camera-motion.ts"),
  "@types/multicam": path.join(root, "src/types/multicam.ts"),
  "@types/shot": path.join(root, "src/types/shot.ts"),
  "@types/theme-tokens": path.join(root, "src/types/theme-tokens.ts"),
  "@types/timeline": path.join(root, "src/types/timeline.ts"),
  "@types/transitions": path.join(root, "src/types/transitions.ts"),
  "@types/vfx": path.join(root, "src/types/vfx.ts"),
  "@components": path.join(root, "src/motion/components"),
  "@lib": path.join(root, "src/lib"),
};

function webpackOverride(config) {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(typeof (config.resolve && config.resolve.alias) === "object" &&
        !Array.isArray(config.resolve.alias)
          ? config.resolve.alias
          : {}),
        ...ALIASES,
      },
    },
  };
}

module.exports = { webpackOverride, ALIASES };
