import Prism from 'prismjs';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-typescript.js';

type PrismLanguage = 'bash' | 'javascript' | 'json' | 'text' | 'typescript';

const languageAliases: Readonly<Record<string, PrismLanguage>> = {
    bash: 'bash',
    js: 'javascript',
    javascript: 'javascript',
    json: 'json',
    sh: 'bash',
    shell: 'bash',
    shellscript: 'bash',
    text: 'text',
    ts: 'typescript',
    tsx: 'typescript',
    txt: 'text',
    typescript: 'typescript'
};

const grammars: Readonly<Record<PrismLanguage, Prism.Grammar>> = {
    bash: Prism.languages.bash,
    javascript: Prism.languages.javascript,
    json: Prism.languages.json,
    text: Prism.languages.plain,
    typescript: Prism.languages.typescript
};

/** Convert a Markdown code fence into Svelte-safe, class-based Prism markup. */
export function highlightPrism(source: string, language: string | null | undefined): string {
    const normalized = languageAliases[language?.toLowerCase() ?? ''] ?? 'text';
    const highlighted = Prism.highlight(source, grammars[normalized], normalized);
    const code = `<code class="language-${normalized}">${highlighted}</code>`;
    return `<pre class="language-${normalized}">{@html ${JSON.stringify(code)}}</pre>`;
}
