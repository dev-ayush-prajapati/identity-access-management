import { defineConfig } from "vitest/config";

// Node environment, no React/DOM: this suite targets pure functions and API
// route handlers (app/api/**/route.ts), not component/page rendering.
export default defineConfig({
  // Resolves the `@/*` alias from tsconfig.json — native in Vite 7+, which is
  // why there's no vite-tsconfig-paths plugin here.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
  },
});
