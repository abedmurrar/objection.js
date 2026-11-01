'use strict';

const globals = require('globals');
const prettier = require('eslint-plugin-prettier');

module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.es2021,
        ...globals.node,
        ...globals.mocha,
      },
    },
    linterOptions: {
      // ESLint 8 didn't report unused disable directives by default.
      reportUnusedDisableDirectives: 'off',
    },
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'error',
      'no-undef': 'error',
    },
  },
];
