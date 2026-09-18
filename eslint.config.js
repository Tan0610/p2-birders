import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The reader must stay independent of the writer: it may only use the standalone format package.
    files: ['apps/reader/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@deccan-birders/writer', '@deccan-birders/writer/*', '**/apps/writer/**', '../../writer/**'], message: 'The reader must not import the writing app.' },
            { group: ['@snaha/swarm-id', '@ethersphere/bee-js'], message: 'The reader is built from FORMAT.md with plain fetch; no Swarm client libraries.' },
          ],
        },
      ],
    },
  },
  {
    // pin and tag may only appear on the own-node branch, never on a path that can reach the public gateway.
    files: ['apps/writer/**/*.{ts,tsx}'],
    ignores: ['apps/writer/src/swarm/uploader.ownNode.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "Property[key.name='pin'][value.value=true]", message: 'pin is only allowed in uploader.ownNode.ts (the gateway refuses Swarm-Pin).' },
        { selector: "Property[key.name='tag']", message: 'tag is only allowed in uploader.ownNode.ts (the gateway refuses Swarm-Tag).' },
      ],
    },
  },
  {
    files: ['tools/**/*.mjs', 'scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/test/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
