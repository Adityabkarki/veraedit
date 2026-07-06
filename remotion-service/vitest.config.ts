import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@types/theme-tokens": path.resolve(__dirname, "src/types/theme-tokens.ts"),
      "@types/audio-analysis": path.resolve(__dirname, "src/types/audio-analysis.ts"),
      "@types/timeline": path.resolve(__dirname, "src/types/timeline.ts"),
      "@types/transitions": path.resolve(__dirname, "src/types/transitions.ts"),
      "@types/camera-motion": path.resolve(__dirname, "src/types/camera-motion.ts"),
      "@types/vfx": path.resolve(__dirname, "src/types/vfx.ts"),
      "@types/multicam": path.resolve(__dirname, "src/types/multicam.ts"),
      "@types/shot": path.resolve(__dirname, "src/types/shot.ts"),
      "@components": path.resolve(__dirname, "src/motion/components"),
      "@lib": path.resolve(__dirname, "src/lib"),
    },
  },
});
