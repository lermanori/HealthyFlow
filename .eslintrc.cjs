/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh', 'react-hooks'],
  ignorePatterns: [
    'dist',
    'build',
    'node_modules',
    'backend',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
    'public',
    'coverage',
  ],
  rules: {
    ...require('eslint-plugin-react-hooks').configs.recommended.rules,
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // Pragmatic defaults for an existing codebase: warn rather than block on
    // the noisy rules so `npm run lint` is usable in CI from day one.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-empty': ['warn', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      // Ambient declaration files legitimately use `declare var` for globals.
      files: ['**/*.d.ts'],
      rules: { 'no-var': 'off' },
    },
  ],
}
