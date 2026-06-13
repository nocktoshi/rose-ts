// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
    ignores: ["**/build/**", "**/dist/**", "**/node_modules/**", "**/src/grpc/gen/**", "scripts/**"],
    files: ["**/*.{js,mjs,ts}"],
    extends: [
        js.configs.recommended,
        tseslint.configs.strict,
        tseslint.configs.stylistic,
    ]
});
