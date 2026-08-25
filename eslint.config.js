import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

const jsxLayout = {
    rules: {
        'tag-newline': {
            meta: {
                type: 'layout',
                docs: {
                    description: 'Require nested and adjacent JSX tags to start on a new line',
                },
                schema: [],
                messages: { newline: 'Start this JSX tag on a new line.' },
            },
            create(context) {
                return {
                    JSXElement(node) {
                        const parent = node.parent
                        let needsNewline = false
                        const parentHasInlineText =
                            parent?.type === 'JSXElement' &&
                            parent.children.some(
                                child => child.type === 'JSXText' && child.value.trim() !== '',
                            )

                        if (
                            parent?.type === 'JSXElement' &&
                            !parentHasInlineText &&
                            node.openingElement.loc.start.line ===
                                parent.openingElement.loc.end.line
                        ) {
                            needsNewline = true
                        }

                        const siblings = parent?.children
                        if (!siblings) return

                        const index = siblings.indexOf(node)
                        const previous = siblings
                            .slice(0, index)
                            .reverse()
                            .find(
                                sibling =>
                                    sibling.type !== 'JSXText' || sibling.value.trim() !== '',
                            )

                        if (
                            !parentHasInlineText &&
                            previous &&
                            previous.loc.end.line === node.openingElement.loc.start.line
                        ) {
                            needsNewline = true
                        }

                        if (needsNewline) {
                            context.report({ node: node.openingElement, messageId: 'newline' })
                        }
                    },
                }
            },
        },
    },
}

export default tseslint.config(
    {
        ignores: [
            'build',
            'dist',
            'node_modules',
            'coverage',
            'android/**/build',
            '*.d.ts',
            '.kilo/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            ...reactRefresh.configs.vite.rules,
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: { globals: globals.node },
    },
    prettierConfig,
    {
        files: ['**/*.{tsx,jsx}'],
        plugins: { 'jsx-layout': jsxLayout },
        rules: { 'jsx-layout/tag-newline': 'error' },
    },
)
