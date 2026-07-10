<script lang="ts">
    import Check from '@lucide/svelte/icons/check';
    import Copy from '@lucide/svelte/icons/copy';
    import { onDestroy } from 'svelte';
    import * as Tooltip from '$lib/components/ui/tooltip';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        readonly text: string;
    }

    let { text }: Props = $props();
    let copied = $state(false);
    let resetTimer: number | undefined;

    function copyCode(): void {
        const operation = navigator.clipboard.writeText(text);
        void operation.then(
            () => {
                copied = true;
                if (resetTimer !== undefined) {
                    window.clearTimeout(resetTimer);
                }
                resetTimer = window.setTimeout(() => {
                    copied = false;
                    resetTimer = undefined;
                }, 1400);
            },
            () => undefined
        );
    }

    onDestroy(() => {
        if (resetTimer !== undefined) {
            window.clearTimeout(resetTimer);
        }
    });
</script>

<Tooltip.Provider>
    <Tooltip.Root>
        <Tooltip.Trigger
            type="button"
            class="copy-code-button"
            aria-label={copied ? m.copied() : m.copy_code()}
            onclick={copyCode}
        >
            {#if copied}
                <Check aria-hidden="true" />
            {:else}
                <Copy aria-hidden="true" />
            {/if}
        </Tooltip.Trigger>
        <Tooltip.Content>{copied ? m.copied() : m.copy_code()}</Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>
