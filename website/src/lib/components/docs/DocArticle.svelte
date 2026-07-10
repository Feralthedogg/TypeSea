<script lang="ts">
    import type { Snippet } from 'svelte';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        readonly children: Snippet;
    }

    let { children }: Props = $props();

    function enhanceArticle(node: HTMLElement) {
        const buttons: Array<{ button: HTMLButtonElement; copy: () => void }> = [];
        const blocks = node.querySelectorAll('pre');
        for (const block of blocks) {
            const code = block.querySelector('code');
            if (code === null) {
                continue;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'copy-code-button';
            button.textContent = '⧉';
            button.title = m.copy_code();
            button.setAttribute('aria-label', m.copy_code());
            const copy = () => {
                const operation = navigator.clipboard.writeText(code.textContent ?? '');
                void operation.then(
                    () => {
                        button.textContent = '✓';
                        button.title = m.copied();
                        window.setTimeout(() => {
                            button.textContent = '⧉';
                            button.title = m.copy_code();
                        }, 1400);
                    },
                    () => undefined
                );
            };
            button.addEventListener('click', copy);
            block.append(button);
            buttons.push({ button, copy });
        }

        return {
            destroy() {
                for (const entry of buttons) {
                    entry.button.removeEventListener('click', entry.copy);
                    entry.button.remove();
                }
            }
        };
    }
</script>

<article class="doc-article" use:enhanceArticle>
    {@render children()}
</article>
