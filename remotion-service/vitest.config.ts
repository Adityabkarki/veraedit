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
      "@components": path.resolve(__dirname, "src/motion/components"),
      "@lib": path.resolve(__dirname, "src/lib"),
    },
  },
});
