import { defineConfig } from "father";

export default defineConfig({
  cjs: {
    input: "src",
    platform: "node",
    transformer: "esbuild",
  },
  esm: {
    input: "src",
    platform: "node",
    transformer: "babel",
  },
});
