import tailwindcss from '@tailwindcss/vite';
import { mdsvex } from 'mdsvex';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import rehypeSlug from 'rehype-slug';

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
                // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
                runes: ({ filename }) =>
                    filename.split(/[/\\]/).includes('node_modules') ? undefined : true
            },
            adapter: adapter(),
            paths: {
                base: basePath,
                relative: false
            },
            preprocess: [
                mdsvex({
                    extensions: ['.svx', '.md'],
                    highlight: false,
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
