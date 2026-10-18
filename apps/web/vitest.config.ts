import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Capa componente de la pirámide QA (docs/qa-flows-inventory.md):
// tests *.test.ts(x) junto al código. jsdom solo en archivos que lo
// declaren con `// @vitest-environment jsdom` - los tests puros
// (wallet-sort, helpers) siguen en node.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
