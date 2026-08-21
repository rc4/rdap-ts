import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import { jsdoc } from 'eslint-plugin-jsdoc';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'This package uses Web APIs, not Node.',
        },
        {
          name: 'Buffer',
          message: 'Use Uint8Array.',
        },
        {
          name: '__dirname',
          message: 'This package uses Web APIs, not Node.',
        },
        {
          name: '__filename',
          message: 'This package uses Web APIs, not Node.',
        },
        {
          name: 'global',
          message: 'Use globalThis.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: 'This package uses Web APIs, not Node.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.{js,mjs,ts}', 'scripts/**/*.mjs', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  jsdoc({
    config: 'flat/recommended-typescript',
    files: ['src/**/*.ts'],
  }),
]);
