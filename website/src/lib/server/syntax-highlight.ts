import { codeToHtml } from 'shiki';

type SyntaxLanguage = 'javascript' | 'json' | 'shellscript' | 'text' | 'typescript';

const languageAliases: Readonly<Record<string, SyntaxLanguage>> = {
    bash: 'shellscript',
    js: 'javascript',
    javascript: 'javascript',
    json: 'json',
    sh: 'shellscript',
    shell: 'shellscript',
    shellscript: 'shellscript',
    text: 'text',
    ts: 'typescript',
    tsx: 'typescript',
    txt: 'text',
    typescript: 'typescript'
};

/**
 * Highlight repository-owned source text during prerendering.
 *
 * The dual VS Code themes are emitted as CSS variables. No Shiki runtime is
 * shipped to the browser, and the page theme selects the matching variables.
 */
export async function highlightCode(
    source: string,
    language: string | null | undefined = 'text'
): Promise<string> {
    const normalized = languageAliases[language?.toLowerCase() ?? ''] ?? 'text';
    return codeToHtml(source, {
        lang: normalized,
        themes: {
            light: 'light-plus',
            dark: 'dark-plus'
        },
        defaultColor: false
    });
}
