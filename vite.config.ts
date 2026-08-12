import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const readGitCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    publicDir: "images",
    plugins: [
      react(),
      {
        name: "emit-beauty-share-bridge",
        apply: "build",
        generateBundle() {
          for (const fileName of ["beauty-share-bridge.html", "service-worker.js", "manifest.webmanifest", "offline.html", "terms.html", "privacy.html", "legal/terms.en.json", "legal/terms.ru.json", "legal/terms.uk.json", "legal/privacy.en.json", "legal/privacy.ru.json", "legal/privacy.uk.json", "legal/legal-localization.js"]) {
            this.emitFile({
              type: "asset",
              fileName,
              source: readFileSync(new URL(`./public/${fileName}`, import.meta.url), "utf8"),
            });
          }
        },
      },
    ],
    define: {
      __GO_IRL_COMMIT__: JSON.stringify(env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || env.VITE_GIT_COMMIT || readGitCommit()),
      __GO_IRL_BUILT_AT__: JSON.stringify(env.VITE_BUILD_TIME || new Date().toISOString()),
    },
    test: {
      setupFiles: ["./src/test/setup.ts"],
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-go-irl-v0-[hash].js",
          chunkFileNames: "assets/[name]-go-irl-v0-[hash].js",
          assetFileNames: "assets/go-irl-v0-[hash][extname]",
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/@tanstack")) {
              return "vendor-react";
            }
            if (id.includes("node_modules/@supabase") || id.includes("node_modules/zustand")) {
              return "vendor-data";
            }
            if (id.includes("node_modules/lucide-react")) {
              return "vendor-icons";
            }
            if (id.includes("/src/verticals/SportVertical") || id.includes("\\src\\verticals\\SportVertical")) {
              return "vertical-sport";
            }
          },
        },
      },
    },
  };
});
