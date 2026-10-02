import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  base: "/",
  server: {
    watch: {
      ignored: ["**/scripts/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        error: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
});
