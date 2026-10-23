import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve("backend/main/index.ts"),
        output: { format: "es" },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve("backend/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: resolve("frontend"),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "development-react-refresh-csp",
        transformIndexHtml(html, context) {
          // React Refresh needs Vite's inline preamble only in development.
          // The packaged application retains its strict self-only script policy.
          return context.server
            ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
            : html;
        },
      },
    ],
    build: {
      minify: true,
      rollupOptions: { input: resolve("frontend/index.html") },
    },
  },
});
