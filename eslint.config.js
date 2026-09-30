import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/*.cjs", "project-audit/**",
      "dist/**",
      ".cinema-worker-dist/**",
      "node_modules/**",
      "old/**",
      "*.tsbuildinfo",
      "vite.config.js",
      "vite.config.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: {
        Deno: "readonly",
        Response: "readonly",
        Request: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        crypto: "readonly",
        btoa: "readonly",
        console: "readonly",
      },
    },
  },
];
