import { defineConfig } from "tsup";

export default defineConfig(() => ({
  entry: ["src/index.ts"],
  dts: true,
  outDir: "dist",
  format: ["esm", "cjs"],
  splitting: false,
  clean: true,
  target: "es2019",
  outExtension({ format }) {
    if (format === "cjs") return { js: ".cjs" };
    if (format === "esm") return { js: ".js" };
    return { js: ".js" };
  },
}));
