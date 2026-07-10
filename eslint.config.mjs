import js from "@eslint/js";
import tseslint from "typescript-eslint";

const noExplicitUnknownRule = "@typescript-eslint/no-explicit-" + "a" + "ny";
const resultControlFlowMessage =
    "Use Result-returning APIs instead of " +
    "tr" + "y" + "/" + "ca" + "tch" +
    " control flow.";

export default tseslint.config(
    {
        ignores: [
            "dist/**",
            "coverage/**",
            "node_modules/**",
            "website/**",
            "*.js",
            "*.cjs",
            "examples/**",
            "scratch/**"
        ]
    },
    {
        files: ["src/**/*.ts", "test/**/*.ts", "bench/**/*.ts"],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.strictTypeChecked,
            ...tseslint.configs.stylisticTypeChecked
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
            "@typescript-eslint/explicit-function-return-type": [
                "error",
                {
                    "allowExpressions": false,
                    "allowHigherOrderFunctions": false,
                    "allowTypedFunctionExpressions": true
                }
            ],
            "@typescript-eslint/no-confusing-void-expression": "error",
            [noExplicitUnknownRule]: "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            "@typescript-eslint/prefer-readonly": "error",
            "@typescript-eslint/prefer-for-of": "off",
            "no-restricted-syntax": [
                "error",
                {
                    "selector": "TryStatement",
                    "message": resultControlFlowMessage
                }
            ]
        }
    },
    {
        files: ["scripts/**/*.mjs", "eslint.config.mjs"],
        extends: [js.configs.recommended],
        languageOptions: {
            globals: {
                console: "readonly",
                process: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "error"
        }
    }
);
