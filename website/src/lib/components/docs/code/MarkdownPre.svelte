<script lang="ts">
    import { onMount } from 'svelte';
    import type { HTMLAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';
    import CopyCodeButton from './CopyCodeButton.svelte';

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLPreElement> = $props();

    let preNode: HTMLPreElement | undefined = $state();
    let source = $state('');

    onMount(() => {
        source = preNode?.innerText.trimEnd() ?? '';
    });
</script>

<div data-slot="code-block" class="code-block markdown-code-block">
    <!-- Keep the child snippet adjacent to the pre tag so Markdown whitespace is preserved. -->
    <pre bind:this={preNode} class={cn(className)} {...restProps}>{@render children?.()}</pre>
    <CopyCodeButton text={source} />
</div>
