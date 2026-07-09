import { defineConfig } from "vite";

export default defineConfig({
  // Project Pages path: the site lives at https://aliig.github.io/factoriopower2.x/
  base: "/factoriopower2.x/",
  build: { target: "es2020" },
});
