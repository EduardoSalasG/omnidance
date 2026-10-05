import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    setupFiles: ["test/setup.ts"],
    // Los e2e bootan una app Nest completa (compile + init + listen +
    // connect a Postgres); bajo paralelismo el default de 10s es corto.
    hookTimeout: 60_000,
  },
});
