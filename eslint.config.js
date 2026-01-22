import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  // Ignore build output and generated stuff
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript (non-type-aware, fast)
  ...tseslint.configs.recommended,

  // App code: TS/TSX
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      // Vite React refresh safety (warn is fine)
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Practical TS rules
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

      // These two are “nice later” but noisy early; keep off initially
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];
