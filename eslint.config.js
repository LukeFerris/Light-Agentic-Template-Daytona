import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

// Code quality plugins
import sonarjs from "eslint-plugin-sonarjs";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  // Build output ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.min.*",
      "**/*.d.ts",
    ],
  },

  // Base language options
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      sonarjs,
      import: importPlugin,
    },
    rules: {},
  },

  // JS + TS recommended
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  // Code quality rules for all packages
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    plugins: {
      jsdoc,
    },
    rules: {
      // --- JSDOC REQUIREMENTS ---
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          publicOnly: true,
        },
      ],
      "jsdoc/require-description": "warn",
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns": "error",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "error",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",

      // --- STOP MONSTER FILES ---
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],

      // --- STOP MONSTER LOGIC ---
      complexity: ["error", 12],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["error", 4],
      "max-statements": ["error", 25],

      // --- BETTER REFACTOR PRESSURE ---
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-functions": "error",

      // --- MODULARITY NUDGES ---
      "import/max-dependencies": [
        "error",
        { max: 25, ignoreTypeImports: true },
      ],
      "import/no-cycle": "warn",

      // --- TYPESCRIPT SPECIFIC ---
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
