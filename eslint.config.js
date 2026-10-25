import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// ESLint base para el repo (Vite + React 19, JSX con runtime automático).
// Reglas clásicas: las recomendadas de JS + rules-of-hooks / exhaustive-deps.
// `no-unused-vars` queda en warn para no bloquear; los errores cortan el lint.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'rounding.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off'
    }
  },
  {
    // rounding.js corre como <script> en el navegador (no pasa por Vite)
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    }
  }
];
