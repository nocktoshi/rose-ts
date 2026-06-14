// @ts-check

import {defineConfig} from 'eslint/config';
import gts from 'gts';
import preferArrowFunctions from 'eslint-plugin-prefer-arrow-functions';

export default defineConfig([
  {
    ignores: [
      '**/build/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/src/grpc/gen/**',
      'scripts/**',
    ],
  },
  // Google TypeScript Style (gts): prettier formatting + Google's eslint rules.
  ...gts,
  // Type-aware rules need a project that also covers tests + root config files
  // (the build tsconfig only includes src/).
  {
    files: ['**/*.ts', '**/*.mts', '**/*.mjs'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Project preference: arrow (lambda) functions over `function` declarations.
  {
    files: ['**/*.{js,mjs,ts}'],
    plugins: {'prefer-arrow-functions': preferArrowFunctions},
    rules: {
      'prefer-arrow-functions/prefer-arrow-functions': [
        'error',
        {
          allowNamedFunctions: false,
          classPropertiesAllowed: false,
          disallowPrototype: true,
          returnStyle: 'unchanged',
          singleReturnOnly: false,
        },
      ],
      // Keep the `x != null` idiom (matches null AND undefined) — autofixing it
      // to `!==` would silently change behavior in the fee/null-guard code.
      eqeqeq: ['error', 'always', {null: 'ignore'}],
    },
  },
]);
