import tailwindcss from '@tailwindcss/vite';
import { mdsvex } from 'mdsvex';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import rehypeSlug from 'rehype-slug';
import { highlightPrism } from './src/lib/server/prism-highlight';

const markdownLayout = fileURLToPath(
    new URL('./src/lib/components/docs/code/MarkdownLayout.svelte', import.meta.url)
);

const configuredBasePath = process.env.BASE_PATH ?? '';
if (configuredBasePath !== '' && !configuredBasePath.startsWith('/')) {
    throw new Error('BASE_PATH must be empty or start with a slash');
}
const basePath = configuredBasePath as '' | `/${string}`;
const rootPattern = `:protocol://:domain(.*)::port?${basePath}/:path(.*)?`;
const koreanPattern = `:protocol://:domain(.*)::port?${basePath}/ko/:path(.*)?`;

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit({
            compilerOptions: {
                // MDsveX emits legacy layout forwarding; let generated Markdown auto-detect its mode.
                runes: ({ filename }) => {
                    if (
                        filename.endsWith('.md') ||
                        filename.split(/[/\\]/).includes('node_modules')
                    ) {
                        return undefined;
                    }
                    return true;
                }
            },
            adapter: adapter(),
            paths: {
                base: basePath,
                relative: false
            },
            preprocess: [
                mdsvex({
                    extensions: ['.svx', '.md'],
                    layout: markdownLayout,
                    highlight: {
                        highlighter: (code, language) => highlightPrism(code, language)
                    },
                    rehypePlugins: [rehypeSlug]
                })
            ],
            extensions: ['.svelte', '.svx', '.md']
        }),
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
            strategy: ['url', 'cookie', 'baseLocale'],
            urlPatterns: [
                {
                    pattern: rootPattern,
                    localized: [
                        ['ko', koreanPattern],
                        ['en', rootPattern]
                    ]
                }
            ]
        })
    ]
});
