import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Node environment, no React/DOM: this suite targets pure functions and API
// route handlers (app/api/**/route.ts), not component/page rendering.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
