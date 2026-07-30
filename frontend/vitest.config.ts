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
    // Tests that issue certificates render a real PDF and pin it (mock CID
    // in test env, but still real work) — comfortably under 5s normally,
    // but tests that do it twice (e.g. claim-then-reclaim) can brush the
    // default 5s timeout under load. Give real integration work headroom.
    testTimeout: 15000,
  },
});
