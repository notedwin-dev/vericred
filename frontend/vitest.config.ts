import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const { parsed: testEnv } = dotenv.config({ path: ".env.test" });

export default defineConfig({
  // tsconfig.json sets jsx: "preserve" for Next's own SWC compiler to
  // handle at build time — Next always uses the automatic runtime
  // regardless, but Vite/esbuild (which Vitest uses) needs telling
  // explicitly, or .tsx files under test fail with "React is not defined".
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: "./src/test/global-setup.ts",
    setupFiles: ["./src/test/setup.ts"],
    env: testEnv,
    // Table truncation between tests isn't safe to parallelize within a run.
    fileParallelism: false,
  },
});
